import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    graph_json: dict[str, Any] | None = None


class ProjectSummary(BaseModel):
    """List-view response. Omits `graph_json` to keep payloads small."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class ProjectResponse(ProjectSummary):
    """Full response including the graph payload."""

    graph_json: dict[str, Any]
