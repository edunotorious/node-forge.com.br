import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from src.vault.schemas import AuthorPublicSummary


class FeedbackCreate(BaseModel):
    message: str = Field(min_length=3, max_length=2000)
    # 1–5 stars; optional so a quick note does not require a rating.
    rating: int | None = Field(default=None, ge=1, le=5)
    # App path only (e.g. /projects/<id>); query strings are dropped client-side.
    # Kept for the team, never shown on the public page (it can hold ids).
    page: str = Field(default="", max_length=200, pattern=r"^(/[^\s?#]*)?$")
    # Hide the author's name on the public page.
    anonymous: bool = False


class FeedbackPublic(BaseModel):
    """One feedback as the community sees it: no email, no page path."""

    id: uuid.UUID
    rating: int | None
    message: str
    created_at: datetime
    anonymous: bool
    # None when anonymous or when the account was deleted.
    author: AuthorPublicSummary | None
    # True for the caller's own feedback (lets them delete it).
    mine: bool


class FeedbackPage(BaseModel):
    items: list[FeedbackPublic]
    total: int
    # Average over the feedback that has a rating; None when none has.
    average_rating: float | None
    rated_count: int
