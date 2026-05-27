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
from src.runner.schemas import JobResponse, TerminalRequest, TerminalResponse

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


# ---------- terminal (REPL) ----------


def _build_terminal_wrapper(history: list[str], command: str) -> str:
    """Wrap the user's REPL command in a script that:
      1. Replays `history` silently (rebuilds the namespace).
      2. Runs `command`. If its LAST statement is an expression, prints
         its repr so the user sees a result — matches the Python REPL.

    Tracebacks are trimmed to hide the wrapper's internal frames so a
    `print "x"` SyntaxError reads like `python3 -i` would print it. The
    full source travels as Python string literals via `repr()`, so we
    never have to think about quoting / escaping the user's input.
    """
    hist_src = "\n".join(history)
    return f'''\
import ast as _ast
import contextlib as _contextlib
import io as _io
import sys as _sys
import traceback as _traceback

_HIST_SRC = {hist_src!r}
_CMD_SRC = {command!r}

_ns = {{}}

# Replay history silently. History was already shown to the user on the
# turn that produced it; suppressing output here keeps the new command's
# output clean.
_silent = _io.StringIO()
with _contextlib.redirect_stdout(_silent), _contextlib.redirect_stderr(_silent):
    try:
        exec(_HIST_SRC, _ns)
    except Exception:
        pass


def _emit_user_traceback(exc):
    """Print only the user-facing piece of an exception, like CPython's
    REPL does. For SyntaxError, that's just `format_exception_only`
    (no traceback). For runtime errors, walk past the wrapper frames
    (filenames that start with `_` or are this script) and start at the
    first `<cmd>` frame."""
    if isinstance(exc, SyntaxError):
        _sys.stderr.write("".join(
            _traceback.format_exception_only(type(exc), exc)
        ))
        return
    tb = exc.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename not in (
        "<cmd>",
        "<stdin>",
    ):
        tb = tb.tb_next
    _sys.stderr.write("".join(
        _traceback.format_exception(type(exc), exc, tb)
    ))


# Run the new command. REPL semantics: a trailing expression prints its
# repr; anything else just executes.
try:
    _parsed = _ast.parse(_CMD_SRC, mode="exec")
except SyntaxError as _se:
    _emit_user_traceback(_se)
else:
    try:
        if _parsed.body and isinstance(_parsed.body[-1], _ast.Expr):
            _prior = _parsed.body[:-1]
            _last = _parsed.body[-1]
            if _prior:
                exec(
                    compile(
                        _ast.Module(body=_prior, type_ignores=[]),
                        "<cmd>",
                        "exec",
                    ),
                    _ns,
                )
            _value = eval(
                compile(_ast.Expression(body=_last.value), "<cmd>", "eval"),
                _ns,
            )
            if _value is not None:
                print(repr(_value))
        else:
            exec(compile(_parsed, "<cmd>", "exec"), _ns)
    except SystemExit:
        raise
    except BaseException as _e:
        _emit_user_traceback(_e)
'''


@router.post("/terminal", response_model=TerminalResponse)
async def terminal(
    data: TerminalRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> TerminalResponse:
    """Stateless REPL. The client owns the conversation history; we just
    forward a wrapped script to the executor and return whatever the new
    command printed. Each call spawns a fresh runner container."""
    script = _build_terminal_wrapper(data.history, data.command)
    timeout = _settings.executor_timeout_seconds + 10
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(
                f"{_settings.executor_url}/run",
                json={"code": script},
                headers={"X-Internal-API-Token": _settings.internal_api_token},
            )
        res.raise_for_status()
        payload = res.json()
        return TerminalResponse(
            stdout=payload.get("stdout", ""),
            stderr=payload.get("stderr", ""),
            status=payload.get("status", "error"),
        )
    except httpx.HTTPError as exc:
        return TerminalResponse(
            stdout="",
            stderr=f"Executor call failed: {exc}",
            status="error",
        )
