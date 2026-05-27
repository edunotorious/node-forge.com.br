import uuid
from datetime import UTC, datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.deps import get_current_user
from src.config import get_settings
from src.db.models import ExecutionJob, Project, ProjectFile, User
from src.db.session import SessionLocal, get_session
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


async def _run_in_background(job_id: uuid.UUID, code: str) -> None:
    """Drive the executor call asynchronously after the HTTP response has
    been sent. Owns its own DB session — the request-scoped one from
    `Depends(get_session)` is already closed by the time this fires.

    Failure modes write back to the job row; we never re-raise, since
    nobody is listening on the other end. The client polls `GET /jobs/{id}`
    to see the result.
    """
    async with SessionLocal() as session:
        job = await session.get(ExecutionJob, job_id)
        if job is None:
            return  # cancelled / already cleaned up — give up silently

        job.status = "running"
        job.started_at = datetime.now(UTC)
        await session.commit()

        # Grace = executor cap + a small buffer for transport + container
        # teardown. The executor itself wall-clocks the run; this is just so
        # we don't drop the connection mid-handshake.
        timeout = _settings.executor_timeout_seconds + 10
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
            job.status = "error"
            job.error_message = f"Executor call failed: {exc}"

        job.finished_at = datetime.now(UTC)
        await session.commit()


@router.post(
    "/projects/{project_id}/files/{file_id}/run",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def run_file(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    background: BackgroundTasks,
) -> ExecutionJob:
    """Kick off a run. Returns the job row immediately with `status=queued`
    (202 Accepted). The client polls `GET /jobs/{id}` to learn the outcome.

    Codegen happens synchronously so user errors (cycles, bad shapes)
    become 400s without ever spinning up a runner container or persisting
    a doomed job row.
    """
    file = await _get_owned_file(session, project_id, file_id, user.id)

    # Validate codegen up front — never queue a job that cannot possibly
    # succeed.
    try:
        code = generate_python(file.graph_json)
    except GraphCycleError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    job = ExecutionJob(project_id=project_id, user_id=user.id, status="queued")
    session.add(job)
    await session.commit()
    await session.refresh(job)

    background.add_task(_run_in_background, job.id, code)
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
