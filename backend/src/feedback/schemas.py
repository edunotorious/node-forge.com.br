import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FeedbackCreate(BaseModel):
    message: str = Field(min_length=3, max_length=2000)
    # 1–5 stars; optional so a quick note does not require a rating.
    rating: int | None = Field(default=None, ge=1, le=5)
    # App path only (e.g. /projects/<id>); query strings are dropped client-side.
    page: str = Field(default="", max_length=200, pattern=r"^(/[^\s?#]*)?$")


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rating: int | None
    message: str
    page: str
    created_at: datetime
