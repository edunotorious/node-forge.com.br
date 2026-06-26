"""Pydantic schemas for the Node Vault marketplace."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Tags are normalized to lowercase + dashes. Anything else (spaces,
# uppercase, weird unicode) gets rejected at the schema layer so the
# /vault?tag= query keys stay tidy.
_TAG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$")


def _normalize_tag(raw: str) -> str:
    return raw.strip().lower().replace(" ", "-").replace("_", "-")


class VaultPublishRequest(BaseModel):
    """Body for POST /vault — publishes a project as a new listing."""

    project_id: uuid.UUID
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=4000)
    # Free-tag, max 5. Empty list is fine.
    tags: list[str] = Field(default_factory=list, max_length=5)

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_and_validate_tags(cls, v: list[str]) -> list[str]:
        if not v:
            return []
        normalized = [_normalize_tag(t) for t in v if t and t.strip()]
        # Dedup while preserving order — the first occurrence wins.
        seen: set[str] = set()
        clean: list[str] = []
        for tag in normalized:
            if not _TAG_RE.match(tag):
                raise ValueError(f"Tag '{tag}' must be 2-50 chars, lowercase letters/digits/dashes")
            if tag not in seen:
                seen.add(tag)
                clean.append(tag)
        return clean


class VaultUpdateRequest(BaseModel):
    """Body for PATCH /vault/{id} — edit title/desc/tags. Republish to
    refresh the graph snapshot."""

    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    tags: list[str] | None = Field(default=None, max_length=5)

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_and_validate_tags(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        return VaultPublishRequest.normalize_and_validate_tags(v)


class AuthorPublicSummary(BaseModel):
    """The author surface visible on a listing — just identity, no email."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str | None = None
    display_name: str | None = None
    has_avatar: bool = False
    country: str | None = None

    @classmethod
    def from_user(cls, user: Any | None) -> AuthorPublicSummary | None:
        """Build from a User row, pulling display_name/country out of
        profile_json. Returns None when the user is None (account-deleted
        state, surfaced as `[deleted]` on the UI)."""
        if user is None:
            return None
        profile = getattr(user, "profile_json", None) or {}
        return cls(
            id=user.id,
            username=user.username,
            display_name=profile.get("display_name") or profile.get("name"),
            has_avatar=user.has_avatar,
            country=profile.get("country"),
        )


class VaultListingSummary(BaseModel):
    """List-view payload — no graph snapshot to keep responses small."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    title: str
    description: str
    tags: list[str] = Field(default_factory=list)
    author: AuthorPublicSummary | None
    published_at: datetime
    updated_at: datetime
    clone_count: int
    like_count: int
    comment_count: int
    # Whether the requesting user has already liked this listing. None
    # when the request is unauthenticated.
    liked_by_me: bool | None = None


class FileSnapshot(BaseModel):
    name: str
    position: int
    graph_json: dict[str, Any]


class VaultListingDetail(VaultListingSummary):
    """Detail-view payload — includes the full files snapshot."""

    files: list[FileSnapshot]


class VaultCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class VaultCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    author: AuthorPublicSummary | None
    body: str
    created_at: datetime
    edited_at: datetime | None
    deleted: bool


class VaultCloneResponse(BaseModel):
    """Returned by POST /vault/{id}/clone — the id of the brand-new
    project in the caller's project list."""

    project_id: uuid.UUID
