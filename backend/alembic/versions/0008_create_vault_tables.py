"""create Node Vault tables

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-26

Vault is the publish-and-share surface for circuits. A publish takes a
*snapshot* of the project's files at publish time — the listing has no
foreign key back to the project once published, just a soft reference,
so the author can delete the original without breaking other users'
clones.

Tables:
    vault_listings: one row per published circuit. files_snapshot is a
        denormalized array of {name, position, graph_json} so detail-page
        renders never need to join across projects.
    vault_tags: free-tag (max 5 per listing, enforced at app layer). One
        row per (listing, tag); indexed by tag for /vault?tag=foo search.
    vault_likes: (user, listing) primary key — a user can like a listing
        at most once. like_count on vault_listings is the denormalized
        rollup so list queries stay O(1) per row.
    vault_comments: thread per listing. Soft-deleted (deleted=true) to
        preserve any reply chain we add later; the author can delete
        their own, anyone can read non-deleted.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vault_listings",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        # author_id is SET NULL on user delete so the listing survives and
        # shows "[deleted user]"; the listing itself is what other users
        # may have cloned and they shouldn't lose discoverability of it.
        sa.Column(
            "author_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # No FK on source_project_id — the source project may be deleted
        # later. We just keep the id so the author can use it to
        # `republish from source`.
        sa.Column("source_project_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        # Slug is built at publish time: lowercase(title) + 8-char nanoid
        # suffix. Unique so /vault/<slug> can route to a single listing.
        sa.Column("slug", sa.String(length=220), nullable=False, unique=True),
        # Snapshot: list of {name, position, graph_json} for every file
        # the project had at publish time. Stored as JSONB so we can
        # filter/sort on shape later (e.g. listings using H+CNOT only).
        sa.Column("files_snapshot", JSONB(), nullable=False),
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        # Denormalized counters. Truthful enough for sort-by-popular even
        # if a like+decrement race occasionally skews by one — we accept
        # that in exchange for O(1) list queries.
        sa.Column("clone_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("like_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("comment_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "idx_vault_listings_published_at",
        "vault_listings",
        ["published_at"],
        unique=False,
    )
    op.create_index(
        "idx_vault_listings_author_id",
        "vault_listings",
        ["author_id"],
        unique=False,
    )
    # Trigram GIN on title is overkill for an MVP; we rely on ILIKE for
    # search — a few hundred listings can do a seq scan in <5 ms.

    op.create_table(
        "vault_tags",
        sa.Column(
            "listing_id",
            sa.Uuid(),
            sa.ForeignKey("vault_listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tag", sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint("listing_id", "tag", name="pk_vault_tags"),
    )
    op.create_index("idx_vault_tags_tag", "vault_tags", ["tag"], unique=False)

    op.create_table(
        "vault_likes",
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "listing_id",
            sa.Uuid(),
            sa.ForeignKey("vault_listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "liked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("user_id", "listing_id", name="pk_vault_likes"),
    )
    op.create_index(
        "idx_vault_likes_listing_id",
        "vault_likes",
        ["listing_id"],
        unique=False,
    )

    op.create_table(
        "vault_comments",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "listing_id",
            sa.Uuid(),
            sa.ForeignKey("vault_listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # SET NULL so deleted authors leave their words behind as "[deleted]"
        # rather than amputating the thread.
        sa.Column(
            "author_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "idx_vault_comments_listing_created",
        "vault_comments",
        ["listing_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_vault_comments_listing_created", table_name="vault_comments")
    op.drop_table("vault_comments")
    op.drop_index("idx_vault_likes_listing_id", table_name="vault_likes")
    op.drop_table("vault_likes")
    op.drop_index("idx_vault_tags_tag", table_name="vault_tags")
    op.drop_table("vault_tags")
    op.drop_index("idx_vault_listings_author_id", table_name="vault_listings")
    op.drop_index("idx_vault_listings_published_at", table_name="vault_listings")
    op.drop_table("vault_listings")
