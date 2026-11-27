"""Node-Forge executor service.

Phase 7 v2: spawns ONE EPHEMERAL container per /run via the host docker
daemon (mounted at /var/run/docker.sock). The runner image is reused from
this same service's build — Qiskit / matplotlib are already inside.

Why ephemeral containers and not subprocess?
  * Memory + CPU limits are enforced by the kernel cgroup, not by Python
    `resource.setrlimit` (which is per-process and can be circumvented).
  * Network isolation is real: `network_disabled=True` removes the loopback
    too, so even a fork-bomb-style attempt to connect anywhere fails.
  * A crashed run kills only its own container; the executor service stays
    healthy for the next request.
  * The runner drops to `user=nobody` so even if a user script escapes
    Python, it's still unprivileged inside the container.

Trade-offs vs the prior subprocess design:
  * Cold start: roughly +1–2 s per /run to create the container. Acceptable
    for circuit runs that typically dominate that anyway.
  * `docker.sock` is root-equivalent to the host. Documented in
    docker-compose.yml. Real production demands gVisor / Firecracker /
    rootless docker / a per-run VM.

The service is reachable ONLY from the backend on `executor-net`; no host
port is published. Auth uses the shared `INTERNAL_API_TOKEN`.
"""

from __future__ import annotations

import base64
import io
import os
import re
import tarfile
import threading
from typing import Annotated

import docker
from docker.errors import ContainerError, ImageNotFound, NotFound
from docker.models.containers import Container
from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

MAX_SCRIPT_BYTES = 200_000
MAX_OUTPUT_BYTES = 1_000_000
MAX_ARTIFACT_BYTES = 10_000_000  # per file, cap before we base64-encode
TRUNCATION_SUFFIX = "\n…[truncated]"

INTERNAL_TOKEN = os.environ.get("INTERNAL_API_TOKEN", "")
TIMEOUT_SECONDS = int(os.environ.get("EXECUTOR_TIMEOUT_SECONDS", "30"))
RUNNER_IMAGE = os.environ.get("RUNNER_IMAGE", "node-forge-executor:latest")
RUNNER_MEM_LIMIT = os.environ.get("RUNNER_MEM_LIMIT", "256m")
RUNNER_CPUS = float(os.environ.get("RUNNER_CPUS", "1.0"))
# Sandbox runtime. Default `runc` is the standard Linux runtime — fast
# but the kernel surface is shared with the host (the docker.sock-mount
# risk we documented). Set to `runsc` to route ephemeral runners through
# gVisor, which intercepts syscalls in user space and presents a small,
# safe subset to the host kernel. The runtime must be pre-registered in
# /etc/docker/daemon.json's `runtimes` block on the host or the Docker
# daemon rejects container creation with 400 Bad Request.
RUNNER_RUNTIME = os.environ.get("RUNNER_RUNTIME", "runc")
RUNNER_WORKDIR = "/work"
# How many runner containers may exist at once. Each one can take
# RUNNER_MEM_LIMIT + RUNNER_CPUS, so size this to the host. A request that
# finds every slot taken waits up to RUN_SLOT_WAIT_SECONDS, then gets a
# "busy" error instead of queueing past the backend's own HTTP timeout.
MAX_CONCURRENT_RUNS = int(os.environ.get("MAX_CONCURRENT_RUNS", "2"))
RUN_SLOT_WAIT_SECONDS = float(os.environ.get("RUN_SLOT_WAIT_SECONDS", "5"))

app = FastAPI(title="Node-Forge Executor", version="0.2.0")
_docker_client: docker.DockerClient | None = None
_docker_client_lock = threading.Lock()
_run_slots = threading.BoundedSemaphore(MAX_CONCURRENT_RUNS)


def _client() -> docker.DockerClient:
    global _docker_client
    with _docker_client_lock:
        if _docker_client is None:
            _docker_client = docker.from_env()
        return _docker_client


# Label that ties a runner container to the backend job driving it, so
# the backend can read partial logs or kill the run while /run is still
# blocked in wait().
RUN_ID_LABEL = "nodeforge.run_id"
RUN_ID_PATTERN = r"^[A-Za-z0-9-]{1,64}$"


class RunRequest(BaseModel):
    code: str = Field(max_length=MAX_SCRIPT_BYTES)
    # Optional: the terminal (REPL) does not track runs, only /run jobs do.
    run_id: str | None = Field(default=None, pattern=RUN_ID_PATTERN)


class Artifact(BaseModel):
    kind: str
    filename: str
    data_b64: str


class LogsResponse(BaseModel):
    running: bool
    stdout: str
    stderr: str


class StopResponse(BaseModel):
    stopped: bool


class RunResponse(BaseModel):
    status: str  # "succeeded" | "failed" | "timeout" | "error"
    stdout: str
    stderr: str
    artifacts: list[Artifact]
    error_message: str | None = None


def _truncate_bytes(b: bytes, limit: int) -> str:
    if len(b) <= limit:
        return b.decode("utf-8", errors="replace")
    head = b[: limit - len(TRUNCATION_SUFFIX.encode("utf-8"))]
    return head.decode("utf-8", errors="replace") + TRUNCATION_SUFFIX


def _make_script_tar(code: str) -> io.BytesIO:
    """Wrap the user code in a tar so we can stream it into the container
    via put_archive. Filename + perms have to be exactly what the runner
    command expects — we hard-code `script.py` mode 0644."""
    buf = io.BytesIO()
    data = code.encode("utf-8")
    with tarfile.open(fileobj=buf, mode="w") as tar:
        info = tarfile.TarInfo(name="script.py")
        info.size = len(data)
        info.mode = 0o644
        # Owner is the nobody UID inside debian-slim (65534). Matching the
        # `user=nobody` we pass on container create keeps file ownership
        # clean if anything inspects it.
        info.uid = 65534
        info.gid = 65534
        tar.addfile(info, io.BytesIO(data))
    buf.seek(0)
    return buf


def _extract_artifacts(container: Container) -> list[Artifact]:
    """Pull /work out of the (stopped) container, find PNGs, base64 them.

    Skips script.py and anything not a regular file. Caps individual files
    at MAX_ARTIFACT_BYTES — a misbehaving run that writes a 100MB image
    should not balloon the response.
    """
    try:
        stream, _ = container.get_archive(RUNNER_WORKDIR)
    except NotFound:
        return []

    raw = b"".join(stream)
    artifacts: list[Artifact] = []
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            name = os.path.basename(member.name)
            if name in ("", "script.py"):
                continue
            if not name.lower().endswith(".png"):
                continue
            if member.size > MAX_ARTIFACT_BYTES:
                continue
            extracted = tar.extractfile(member)
            if extracted is None:
                continue
            data = extracted.read()
            artifacts.append(
                Artifact(
                    kind="image/png",
                    filename=name,
                    data_b64=base64.b64encode(data).decode("ascii"),
                )
            )
    return artifacts


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _check_token(token: str | None) -> None:
    if not INTERNAL_TOKEN or token != INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API token",
        )


def _find_run_container(run_id: str) -> Container | None:
    if not re.match(RUN_ID_PATTERN, run_id):
        return None
    found = _client().containers.list(all=True, filters={"label": f"{RUN_ID_LABEL}={run_id}"})
    return found[0] if found else None


@app.get("/runs/{run_id}/logs", response_model=LogsResponse)
def run_logs(
    run_id: str,
    x_internal_api_token: Annotated[str | None, Header()] = None,
) -> LogsResponse:
    """Partial stdout/stderr of a run still in flight, so the editor can
    show output while the script runs instead of only at the end."""
    _check_token(x_internal_api_token)
    container = _find_run_container(run_id)
    if container is None:
        return LogsResponse(running=False, stdout="", stderr="")
    try:
        container.reload()
        stdout = container.logs(stdout=True, stderr=False)
        stderr = container.logs(stdout=False, stderr=True)
        running = container.status in ("created", "running")
    except NotFound:
        return LogsResponse(running=False, stdout="", stderr="")
    return LogsResponse(
        running=running,
        stdout=_truncate_bytes(stdout, MAX_OUTPUT_BYTES),
        stderr=_truncate_bytes(stderr, MAX_OUTPUT_BYTES),
    )


@app.post("/runs/{run_id}/stop", response_model=StopResponse)
def stop_run(
    run_id: str,
    x_internal_api_token: Annotated[str | None, Header()] = None,
) -> StopResponse:
    """Kill a run in flight. The /run call blocked in wait() then returns
    with whatever output the script produced; the backend records the job
    as cancelled."""
    _check_token(x_internal_api_token)
    container = _find_run_container(run_id)
    if container is None:
        return StopResponse(stopped=False)
    try:
        container.kill()
    except Exception:
        # Already exited (or removed) between the lookup and the kill.
        return StopResponse(stopped=False)
    return StopResponse(stopped=True)


# Plain `def`, not `async def`: the docker SDK is blocking (wait() alone
# can take TIMEOUT_SECONDS), so FastAPI must run this in its threadpool.
# As a coroutine it froze the event loop, which serialized every run and
# made /health hang while one was in flight.
@app.post("/run", response_model=RunResponse)
def run(
    req: RunRequest,
    x_internal_api_token: Annotated[str | None, Header()] = None,
) -> RunResponse:
    _check_token(x_internal_api_token)

    if not _run_slots.acquire(timeout=RUN_SLOT_WAIT_SECONDS):
        return RunResponse(
            status="error",
            stdout="",
            stderr="",
            artifacts=[],
            error_message="Executor is busy, try again in a few seconds",
        )
    try:
        return _run_in_sandbox(req.code, req.run_id)
    finally:
        _run_slots.release()


def _run_in_sandbox(code: str, run_id: str | None = None) -> RunResponse:
    client = _client()

    try:
        container: Container = client.containers.create(
            image=RUNNER_IMAGE,
            # `python -u` flushes stdout/stderr so `docker logs` sees output
            # even if the script crashes before its buffer drains.
            command=["python", "-u", "script.py"],
            working_dir=RUNNER_WORKDIR,
            environment={
                "MPLBACKEND": "Agg",
                "PYTHONDONTWRITEBYTECODE": "1",
                "PYTHONUNBUFFERED": "1",
                # `nobody`'s HOME is /nonexistent in debian-slim; matplotlib
                # logs a warning when it can't create ~/.config/matplotlib.
                # Point it at /tmp where the user has write access.
                "HOME": "/tmp",
                "MPLCONFIGDIR": "/tmp/.matplotlib",
            },
            mem_limit=RUNNER_MEM_LIMIT,
            memswap_limit=RUNNER_MEM_LIMIT,  # block swap escape from the cap
            nano_cpus=int(RUNNER_CPUS * 1_000_000_000),
            network_disabled=True,
            user="nobody",
            # Drop every capability — the runner does not need any kernel
            # privilege beyond the default Python interpreter's needs.
            cap_drop=["ALL"],
            # PID limit: 100 keeps thread bombs from monopolising the host.
            pids_limit=100,
            # `runc` (default) or `runsc` (gVisor) — see RUNNER_RUNTIME.
            runtime=RUNNER_RUNTIME,
            labels={RUN_ID_LABEL: run_id} if run_id else {},
            detach=True,
        )
    except ImageNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Runner image not found: {RUNNER_IMAGE}",
        ) from exc

    try:
        container.put_archive(RUNNER_WORKDIR, _make_script_tar(code).read())
        container.start()
        try:
            result = container.wait(timeout=TIMEOUT_SECONDS)
            exit_code = int(result.get("StatusCode", 1))
            timed_out = False
        except Exception:
            # docker SDK raises requests.ReadTimeout on wait() timeout.
            try:
                container.kill()
            except Exception:
                pass
            exit_code = -1
            timed_out = True

        stdout = container.logs(stdout=True, stderr=False)
        stderr = container.logs(stdout=False, stderr=True)
        artifacts = _extract_artifacts(container)

        if timed_out:
            return RunResponse(
                status="timeout",
                stdout=_truncate_bytes(stdout, MAX_OUTPUT_BYTES),
                stderr=_truncate_bytes(stderr, MAX_OUTPUT_BYTES),
                artifacts=artifacts,
                error_message=f"Execution timed out after {TIMEOUT_SECONDS}s",
            )
        if exit_code == 0:
            return RunResponse(
                status="succeeded",
                stdout=_truncate_bytes(stdout, MAX_OUTPUT_BYTES),
                stderr=_truncate_bytes(stderr, MAX_OUTPUT_BYTES),
                artifacts=artifacts,
            )
        # Non-zero exit but not a timeout — surface as `failed`. OOM kills
        # land here too (StatusCode 137 with an OOMKilled flag the SDK
        # exposes via `result`); we don't currently special-case them.
        return RunResponse(
            status="failed",
            stdout=_truncate_bytes(stdout, MAX_OUTPUT_BYTES),
            stderr=_truncate_bytes(stderr, MAX_OUTPUT_BYTES),
            artifacts=artifacts,
            error_message=f"Script exited with code {exit_code}",
        )
    except ContainerError as exc:
        return RunResponse(
            status="error",
            stdout="",
            stderr=str(exc),
            artifacts=[],
            error_message="Container runtime error",
        )
    finally:
        try:
            container.remove(force=True)
        except Exception:
            # Cleanup-failure should never mask the user-visible result.
            pass
