"""Node Vault marketplace routes.

Public surface — listings + comments are readable without authentication
so the page works as a vitrine. Mutating actions (publish, like, comment,
clone, edit, delete) all require a valid auth cookie.

Snapshot semantics: a publish copies every file of the source project
into `files_snapshot`. The source project can be edited or deleted
later without affecting any of the listing's content. Republishing is
the only way to push fresh content to the listing.

Performance shape: list responses include denormalized counts
(`clone_count`, `like_count`, `comment_count`) so a 50-row listing page
runs as one SELECT plus one tag-aggregation. The `liked_by_me` column
is computed via a subquery against `vault_likes` keyed on the optional
user.
"""

from __future__ import annotations

import re
import secrets
import unicodedata
import uuid
from collections import defaultdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, asc, delete, desc, exists, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.deps import get_current_user, get_optional_user
from src.db.models import (
    Project,
    ProjectFile,
    User,
    VaultComment,
    VaultLike,
    VaultListing,
    VaultTag,
)
from src.db.session import get_session
from src.vault.schemas import (
    AuthorPublicSummary,
    FileSnapshot,
    VaultCloneResponse,
    VaultCommentCreate,
    VaultCommentResponse,
    VaultListingDetail,
    VaultListingSummary,
    VaultPublishRequest,
    VaultTagCount,
    VaultUpdateRequest,
)

router = APIRouter(prefix="/vault", tags=["vault"])


# ---------------------------------------------------------------------------
# Slug generation
# ---------------------------------------------------------------------------
_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")


def _slugify(raw: str) -> str:
    """Convert title text to a URL-safe stem (no random suffix yet).

    Strips accents (NFD + ASCII pass) so `Algoritmo de Grover` →
    `algoritmo-de-grover` instead of leaking unicode in URLs.
    """
    normalized = unicodedata.normalize("NFD", raw)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    slug = _SLUG_STRIP_RE.sub("-", ascii_only.lower()).strip("-")
    return slug[:200] if slug else "listing"


async def _unique_slug(session: AsyncSession, base: str) -> str:
    """Append a short random suffix and confirm uniqueness.

    Loops up to 5 times before giving up — at that point either Postgres
    has a deeper problem or the user picked something pathological. The
    `secrets.token_hex(4)` gives 8 hex chars; collision is ~1 in 4 billion.
    """
    for _ in range(5):
        candidate = f"{base}-{secrets.token_hex(4)}"
        present = await session.execute(
            select(VaultListing.id).where(VaultListing.slug == candidate)
        )
        if present.first() is None:
            return candidate
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not allocate a unique slug; please retry",
    )


# ---------------------------------------------------------------------------
# Tag helpers
# ---------------------------------------------------------------------------
async def _tags_by_listing(
    session: AsyncSession, listing_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[str]]:
    """Bulk-load tags for a set of listings in one query.

    Returns {listing_id: [tag, …]} with empty lists for listings that
    have no tags so the caller doesn't have to KeyError-guard.
    """
    if not listing_ids:
        return {}
    rows = await session.execute(
        select(VaultTag.listing_id, VaultTag.tag).where(VaultTag.listing_id.in_(listing_ids))
    )
    out: dict[uuid.UUID, list[str]] = defaultdict(list)
    for lid, tag in rows.all():
        out[lid].append(tag)
    # Make sure every requested id is keyed even if it had zero tags.
    for lid in listing_ids:
        out.setdefault(lid, [])
    return dict(out)


async def _liked_set(
    session: AsyncSession, user_id: uuid.UUID | None, listing_ids: list[uuid.UUID]
) -> set[uuid.UUID]:
    """Which of the given listings has the user already liked?

    Returns an empty set for unauthenticated callers — keeps the call
    site simple (no None branches downstream).
    """
    if user_id is None or not listing_ids:
        return set()
    rows = await session.execute(
        select(VaultLike.listing_id).where(
            and_(
                VaultLike.user_id == user_id,
                VaultLike.listing_id.in_(listing_ids),
            )
        )
    )
    return {row[0] for row in rows.all()}


def _snapshot_stats(snapshot: list[Any]) -> tuple[int, int, int]:
    """(file_count, node_count, num_qubits) of a files snapshot.

    num_qubits is the widest file, which is what a buyer cares about.
    Defensive about shape: snapshots are user-authored JSON."""
    node_count = 0
    num_qubits = 0
    for entry in snapshot:
        graph = entry.get("graph_json") or {}
        nodes = graph.get("nodes")
        node_count += len(nodes) if isinstance(nodes, list) else 0
        qubits = (graph.get("config") or {}).get("num_qubits")
        if isinstance(qubits, int):
            num_qubits = max(num_qubits, qubits)
    return len(snapshot), node_count, num_qubits


def _build_summary(
    listing: VaultListing,
    tags: list[str],
    liked_by_me: bool | None,
) -> VaultListingSummary:
    file_count, node_count, num_qubits = _snapshot_stats(listing.files_snapshot or [])
    return VaultListingSummary(
        id=listing.id,
        slug=listing.slug,
        title=listing.title,
        description=listing.description,
        tags=tags,
        author=AuthorPublicSummary.from_user(listing.author),
        published_at=listing.published_at,
        updated_at=listing.updated_at,
        clone_count=listing.clone_count,
        like_count=listing.like_count,
        comment_count=listing.comment_count,
        liked_by_me=liked_by_me,
        price_cents=listing.price_cents,
        currency=listing.currency,
        file_count=file_count,
        node_count=node_count,
        num_qubits=num_qubits,
    )


def _is_locked(listing: VaultListing, viewer_id: uuid.UUID | None) -> bool:
    """Paid listings are preview-only for everyone except their author."""
    return listing.price_cents > 0 and (viewer_id is None or listing.author_id != viewer_id)


# ---------------------------------------------------------------------------
# Publish
# ---------------------------------------------------------------------------
@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=VaultListingDetail,
)
async def publish_project(
    data: VaultPublishRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VaultListingDetail:
    """Snapshot the project's files into a new listing."""
    project = await session.get(Project, data.project_id)
    if project is None or project.user_id != user.id:
        # Same 404 for "not yours" as for "doesn't exist" — don't reveal
        # whether the id maps to someone else's project.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    files_rows = await session.execute(
        select(ProjectFile)
        .where(ProjectFile.project_id == project.id)
        .order_by(ProjectFile.position)
    )
    files = files_rows.scalars().all()
    snapshot = [
        {
            "name": f.name,
            "position": f.position,
            "graph_json": f.graph_json,
        }
        for f in files
    ]

    base_slug = _slugify(data.title)
    slug = await _unique_slug(session, base_slug)

    listing = VaultListing(
        author_id=user.id,
        source_project_id=project.id,
        title=data.title,
        description=data.description,
        slug=slug,
        files_snapshot=snapshot,
        price_cents=data.price_cents,
    )
    session.add(listing)
    await session.flush()  # need the id for the tag rows

    for tag in data.tags:
        session.add(VaultTag(listing_id=listing.id, tag=tag))

    await session.commit()
    await session.refresh(listing)
    # Reload with the author for the response.
    listing = (
        await session.execute(
            select(VaultListing)
            .options(selectinload(VaultListing.author))
            .where(VaultListing.id == listing.id)
        )
    ).scalar_one()

    return _detail_from_listing(listing, tags=data.tags, liked_by_me=False, viewer_id=user.id)


def _detail_from_listing(
    listing: VaultListing,
    tags: list[str],
    liked_by_me: bool | None,
    viewer_id: uuid.UUID | None,
) -> VaultListingDetail:
    summary = _build_summary(listing, tags, liked_by_me)
    locked = _is_locked(listing, viewer_id)
    return VaultListingDetail(
        **summary.model_dump(),
        files=[
            FileSnapshot(
                name=f["name"],
                position=f["position"],
                graph_json=(
                    {"config": (f.get("graph_json") or {}).get("config") or {}}
                    if locked
                    else f["graph_json"]
                ),
            )
            for f in listing.files_snapshot
        ],
        locked=locked,
    )


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------
@router.get("", response_model=list[VaultListingSummary])
async def list_listings(
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User | None, Depends(get_optional_user)],
    q: str | None = Query(default=None, max_length=200),
    tag: str | None = Query(default=None, max_length=50),
    author: uuid.UUID | None = Query(default=None),
    price: str = Query(default="all", pattern="^(all|free|paid)$"),
    sort: str = Query(default="recent", pattern="^(recent|popular|liked|price_asc|price_desc)$"),
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[VaultListingSummary]:
    """Public list with optional text search and filters.

    Sort modes:
        recent  — newest published_at first (default)
        popular — most clones first, then likes as tiebreak
        liked   — most likes first
        price_asc / price_desc — cheapest / most expensive first
    """
    stmt = select(VaultListing).options(selectinload(VaultListing.author))

    if q:
        like_pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                VaultListing.title.ilike(like_pattern),
                VaultListing.description.ilike(like_pattern),
            )
        )
    if tag:
        # Subquery — listing must have at least one matching tag.
        tag_match = exists().where(
            and_(VaultTag.listing_id == VaultListing.id, VaultTag.tag == tag.lower())
        )
        stmt = stmt.where(tag_match)
    if author:
        stmt = stmt.where(VaultListing.author_id == author)
    if price == "free":
        stmt = stmt.where(VaultListing.price_cents == 0)
    elif price == "paid":
        stmt = stmt.where(VaultListing.price_cents > 0)

    if sort == "popular":
        stmt = stmt.order_by(
            desc(VaultListing.clone_count),
            desc(VaultListing.like_count),
            desc(VaultListing.published_at),
        )
    elif sort == "liked":
        stmt = stmt.order_by(
            desc(VaultListing.like_count),
            desc(VaultListing.published_at),
        )
    elif sort in ("price_asc", "price_desc"):
        direction = asc if sort == "price_asc" else desc
        stmt = stmt.order_by(
            direction(VaultListing.price_cents),
            desc(VaultListing.published_at),
        )
    else:
        stmt = stmt.order_by(desc(VaultListing.published_at))

    stmt = stmt.limit(limit).offset(offset)

    listings = (await session.execute(stmt)).scalars().all()
    ids = [listing.id for listing in listings]
    tags_map = await _tags_by_listing(session, ids)
    liked = await _liked_set(session, user.id if user else None, ids)

    return [
        _build_summary(
            listing,
            tags_map.get(listing.id, []),
            liked_by_me=(listing.id in liked) if user else None,
        )
        for listing in listings
    ]


# ---------------------------------------------------------------------------
# Tags — the most used ones, for the marketplace category strip. Declared
# before /{slug} so "tags" is not read as a listing slug.
# ---------------------------------------------------------------------------
@router.get("/tags", response_model=list[VaultTagCount])
async def popular_tags(
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=12, ge=1, le=50),
) -> list[VaultTagCount]:
    count = func.count(VaultTag.listing_id)
    rows = await session.execute(
        select(VaultTag.tag, count)
        .group_by(VaultTag.tag)
        .order_by(desc(count), VaultTag.tag)
        .limit(limit)
    )
    return [VaultTagCount(tag=tag, count=n) for tag, n in rows.all()]


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------
@router.get("/{slug}", response_model=VaultListingDetail)
async def get_listing(
    slug: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[User | None, Depends(get_optional_user)],
) -> VaultListingDetail:
    listing = (
        await session.execute(
            select(VaultListing)
            .options(selectinload(VaultListing.author))
            .where(VaultListing.slug == slug)
        )
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    tags_map = await _tags_by_listing(session, [listing.id])
    liked = await _liked_set(session, user.id if user else None, [listing.id])
    return _detail_from_listing(
        listing,
        tags=tags_map.get(listing.id, []),
        liked_by_me=(listing.id in liked) if user else None,
        viewer_id=user.id if user else None,
    )


# ---------------------------------------------------------------------------
# Edit metadata (no graph refresh — that's republish)
# ---------------------------------------------------------------------------
@router.patch("/{listing_id}", response_model=VaultListingDetail)
async def update_listing(
    listing_id: uuid.UUID,
    data: VaultUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VaultListingDetail:
    listing = await session.get(VaultListing, listing_id)
    if listing is None or listing.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")

    if data.title is not None:
        listing.title = data.title
    if data.description is not None:
        listing.description = data.description
    if data.price_cents is not None:
        listing.price_cents = data.price_cents

    if data.tags is not None:
        # Replace-all semantics: easier to reason about than diff-merge,
        # and the 5-tag cap means the churn is tiny.
        await session.execute(delete(VaultTag).where(VaultTag.listing_id == listing.id))
        for tag in data.tags:
            session.add(VaultTag(listing_id=listing.id, tag=tag))

    await session.commit()
    await session.refresh(listing)
    listing = (
        await session.execute(
            select(VaultListing)
            .options(selectinload(VaultListing.author))
            .where(VaultListing.id == listing.id)
        )
    ).scalar_one()
    tags_map = await _tags_by_listing(session, [listing.id])
    return _detail_from_listing(
        listing, tags=tags_map.get(listing.id, []), liked_by_me=False, viewer_id=user.id
    )


# ---------------------------------------------------------------------------
# Republish (refresh snapshot from current project state)
# ---------------------------------------------------------------------------
@router.post("/{listing_id}/republish", response_model=VaultListingDetail)
async def republish_listing(
    listing_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VaultListingDetail:
    listing = await session.get(VaultListing, listing_id)
    if listing is None or listing.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    if listing.source_project_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Source project no longer exists; cannot refresh snapshot",
        )

    project = await session.get(Project, listing.source_project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Source project no longer exists; cannot refresh snapshot",
        )

    files = (
        (
            await session.execute(
                select(ProjectFile)
                .where(ProjectFile.project_id == project.id)
                .order_by(ProjectFile.position)
            )
        )
        .scalars()
        .all()
    )
    listing.files_snapshot = [
        {"name": f.name, "position": f.position, "graph_json": f.graph_json} for f in files
    ]
    await session.commit()
    await session.refresh(listing)
    listing = (
        await session.execute(
            select(VaultListing)
            .options(selectinload(VaultListing.author))
            .where(VaultListing.id == listing.id)
        )
    ).scalar_one()
    tags_map = await _tags_by_listing(session, [listing.id])
    return _detail_from_listing(
        listing, tags=tags_map.get(listing.id, []), liked_by_me=False, viewer_id=user.id
    )


# ---------------------------------------------------------------------------
# Unpublish (delete)
# ---------------------------------------------------------------------------
@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def unpublish_listing(
    listing_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    listing = await session.get(VaultListing, listing_id)
    if listing is None or listing.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    await session.delete(listing)
    await session.commit()


# ---------------------------------------------------------------------------
# Clone — make a copy of the listing's snapshot into the user's projects
# ---------------------------------------------------------------------------
@router.post("/{listing_id}/clone", response_model=VaultCloneResponse)
async def clone_listing(
    listing_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VaultCloneResponse:
    listing = await session.get(VaultListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    if _is_locked(listing, user.id):
        # No checkout yet: a paid listing can only be cloned by its author.
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="This listing is paid; purchases are not available yet",
        )

    # Build a new project from the snapshot. Naming convention mirrors the
    # browser "Save as" flow — `Bell state (clone)` so the user can tell
    # which one came from the vault.
    clone = Project(
        user_id=user.id,
        name=f"{listing.title} (clone)"[:255],
        description=listing.description[:1000] if listing.description else None,
    )
    for entry in listing.files_snapshot:
        clone.files.append(
            ProjectFile(
                name=entry["name"],
                position=entry["position"],
                graph_json=entry["graph_json"],
            )
        )
    session.add(clone)

    # Bump the denormalized counter atomically — concurrent clones
    # increment without a read-modify-write race.
    await session.execute(
        update(VaultListing)
        .where(VaultListing.id == listing.id)
        .values(clone_count=VaultListing.clone_count + 1)
    )

    await session.commit()
    await session.refresh(clone)
    return VaultCloneResponse(project_id=clone.id)


# ---------------------------------------------------------------------------
# Like toggle
# ---------------------------------------------------------------------------
@router.post("/{listing_id}/like", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def like_listing(
    listing_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    listing = await session.get(VaultListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    existing = await session.get(VaultLike, {"user_id": user.id, "listing_id": listing.id})
    if existing is not None:
        return  # idempotent — already liked
    session.add(VaultLike(user_id=user.id, listing_id=listing.id))
    await session.execute(
        update(VaultListing)
        .where(VaultListing.id == listing.id)
        .values(like_count=VaultListing.like_count + 1)
    )
    await session.commit()


@router.delete("/{listing_id}/like", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def unlike_listing(
    listing_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    existing = await session.get(VaultLike, {"user_id": user.id, "listing_id": listing_id})
    if existing is None:
        return  # idempotent
    await session.delete(existing)
    # Floor at 0 so a stale counter never goes negative — a small risk if
    # the denormalized value drifted from reality during an earlier bug.
    await session.execute(
        update(VaultListing)
        .where(VaultListing.id == listing_id, VaultListing.like_count > 0)
        .values(like_count=VaultListing.like_count - 1)
    )
    await session.commit()


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------
@router.get("/{listing_id}/comments", response_model=list[VaultCommentResponse])
async def list_comments(
    listing_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[VaultCommentResponse]:
    rows = (
        (
            await session.execute(
                select(VaultComment)
                .options(selectinload(VaultComment.author))
                .where(VaultComment.listing_id == listing_id)
                .order_by(VaultComment.created_at)
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return [
        VaultCommentResponse(
            id=c.id,
            author=AuthorPublicSummary.from_user(c.author),
            # Soft-deleted comments still appear so the thread structure
            # makes sense, but their body is masked.
            body="[deleted]" if c.deleted else c.body,
            created_at=c.created_at,
            edited_at=c.edited_at,
            deleted=c.deleted,
        )
        for c in rows
    ]


@router.post(
    "/{listing_id}/comments",
    status_code=status.HTTP_201_CREATED,
    response_model=VaultCommentResponse,
)
async def add_comment(
    listing_id: uuid.UUID,
    data: VaultCommentCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VaultCommentResponse:
    listing = await session.get(VaultListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    comment = VaultComment(
        listing_id=listing.id,
        author_id=user.id,
        body=data.body.strip(),
    )
    session.add(comment)
    await session.execute(
        update(VaultListing)
        .where(VaultListing.id == listing.id)
        .values(comment_count=VaultListing.comment_count + 1)
    )
    await session.commit()
    await session.refresh(comment)
    return VaultCommentResponse(
        id=comment.id,
        author=AuthorPublicSummary.from_user(user),
        body=comment.body,
        created_at=comment.created_at,
        edited_at=comment.edited_at,
        deleted=False,
    )


@router.delete(
    "/{listing_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_comment(
    listing_id: uuid.UUID,
    comment_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    comment = await session.get(VaultComment, comment_id)
    if comment is None or comment.listing_id != listing_id or comment.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if comment.deleted:
        return
    comment.deleted = True
    await session.execute(
        update(VaultListing)
        .where(VaultListing.id == listing_id, VaultListing.comment_count > 0)
        .values(comment_count=VaultListing.comment_count - 1)
    )
    await session.commit()
