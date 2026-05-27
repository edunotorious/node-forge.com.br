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


class ProjectFileSummary(BaseModel):
    """File metadata for the project list view — no `graph_json` so a project
    with many large files does not balloon the response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    position: int
    created_at: datetime
    updated_at: datetime


class ProjectSummary(BaseModel):
    """List-view response for /projects."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    # Derived from the ORM's `has_thumbnail` property — the bytes never ride
    # along on /projects so listing scales.
    has_thumbnail: bool = False
    created_at: datetime
    updated_at: datetime


class ProjectResponse(ProjectSummary):
    """Single-project response — includes file summaries but not their
    graphs. Use `GET /projects/{id}/files/{file_id}` to fetch a graph."""

    files: list[ProjectFileSummary]


class ProjectFileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    # Optional override of the initial graph; defaults to DEFAULT_GRAPH on
    # the model side.
    graph_json: dict[str, Any] | None = None


class ProjectFileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    graph_json: dict[str, Any] | None = None
    position: int | None = Field(default=None, ge=0)


class ProjectFileResponse(ProjectFileSummary):
    """Full file response — includes `graph_json`."""

    graph_json: dict[str, Any]
