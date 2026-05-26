import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class Artifact(BaseModel):
    kind: str
    filename: str
    data_b64: str


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
