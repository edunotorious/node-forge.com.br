import uuid
from datetime import datetime, timezone
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.deps import get_current_user
from src.config import get_settings
from src.db.models import ExecutionJob, Project, ProjectFile, User
from src.db.session import get_session
from src.runner.codegen import GraphCycleError, generate_python
from src.runner.schemas import JobResponse

router = APIRouter(tags=["runner"])

_settings = get_settings()


async def _get_owned_file(
    session: AsyncSession,
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ProjectFile:
    """Mirror of projects/_get_owned_file — duplicated here so the runner
    module is self-contained and doesn't import from projects.routes (which
    would cross-couple the two modules)."""
    stmt = (
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.files))
    )
    project = (await session.execute(stmt)).scalar_one_or_none()
    if project is None or project.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    for f in project.files:
        if f.id == file_id:
            return f
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
    )


@router.post(
    "/projects/{project_id}/files/{file_id}/run",
    response_model=JobResponse,
)
async def run_file(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExecutionJob:
    """Generate Python from the file's graph and run it via the executor.

    Synchronous v1: the client waits for the executor to complete; the job
    row is updated end-to-end before this endpoint returns. Async (poll a
    job_id) is a follow-up — it matters once executions exceed ~5–10 s.
    """
    file = await _get_owned_file(session, project_id, file_id, user.id)

    job = ExecutionJob(project_id=project_id, user_id=user.id, status="queued")
    session.add(job)
    await session.commit()
    await session.refresh(job)

    # Generate code OUTSIDE the executor call so codegen failures (cycles,
    # bad shapes) are reported as bad-request without ever touching the
    # network — they're user errors, not system errors.
    try:
        code = generate_python(file.graph_json)
    except GraphCycleError as exc:
        job.status = "failed"
        job.error_message = str(exc)
        job.finished_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(job)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    job.status = "running"
    job.started_at = datetime.now(timezone.utc)
    await session.commit()

    timeout = _settings.executor_timeout_seconds + 5  # small grace
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(
                f"{_settings.executor_url}/run",
                json={"code": code},
                headers={"X-Internal-API-Token": _settings.internal_api_token},
            )
        res.raise_for_status()
        payload = res.json()
        job.status = payload.get("status", "error")
        job.stdout = payload.get("stdout", "")
        job.stderr = payload.get("stderr", "")
        job.artifacts_json = payload.get("artifacts", [])
        job.error_message = payload.get("error_message")
    except httpx.HTTPError as exc:
        # Executor unreachable / 5xx — distinguish from user-code failures by
        # the "error" status. The job row remains for retrospection.
        job.status = "error"
        job.error_message = f"Executor call failed: {exc}"

    job.finished_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(job)
    return job


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExecutionJob:
    job = await session.get(ExecutionJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )
    return job
