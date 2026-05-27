import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Artifact(BaseModel):
    kind: str
    filename: str
    data_b64: str


class TerminalRequest(BaseModel):
    """One REPL step. The client accumulates `history` locally and resubmits
    the full list with each new command — the executor sandbox is fresh per
    call, so state has to be re-applied on every turn."""

    # Cap the history both to keep request bodies bounded and to bound the
    # exec time on the executor side. 500 entries × ~200 chars each = 100KB,
    # comfortably under the executor's 200KB script cap once wrapped.
    history: list[str] = Field(default_factory=list, max_length=500)
    command: str = Field(min_length=1, max_length=10_000)


class TerminalResponse(BaseModel):
    stdout: str
    stderr: str
    status: str  # "succeeded" | "failed" | "timeout" | "error"


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    status: str
    stdout: str
    stderr: str
    artifacts_json: list[dict[str, Any]]
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime
