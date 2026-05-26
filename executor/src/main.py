"""Node-Forge executor service.

Phase 7 v1: runs user Python scripts via `subprocess.run` inside this
container, captures stdout/stderr, and returns any PNG artifacts written to
the working directory (e.g. matplotlib `savefig` of a histogram).

This is intentionally simpler than the README's full ephemeral-container
design — the architecture upgrade (docker.sock + per-run containers,
microVM, gVisor, etc.) is tracked separately. v1 trade-offs:

  + Functional immediately; no second image to build.
  + Container isolation between executor and backend is preserved.
  - User code crashes can kill this service (run with --restart in compose).
  - Resource limits via the OS, not per-run; one bad job affects the next.
  - No network isolation per-run.

The service is reachable ONLY from the backend (bridged on `executor-net`
in docker-compose, no port exposed to host). Auth uses the shared
`INTERNAL_API_TOKEN` env var.
"""

from __future__ import annotations

import base64
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

# Caps both directions: the LLM-friendly bound on script size keeps a
# pathological payload from OOM'ing the executor; the output cap matches the
# feedback-memory rule that any user-supplied stream is hard-capped.
MAX_SCRIPT_BYTES = 200_000
MAX_OUTPUT_BYTES = 1_000_000  # 1 MB per stream
TRUNCATION_SUFFIX = "\n…[truncated]"

INTERNAL_TOKEN = os.environ.get("INTERNAL_API_TOKEN", "")
TIMEOUT_SECONDS = int(os.environ.get("EXECUTOR_TIMEOUT_SECONDS", "30"))

app = FastAPI(title="Node-Forge Executor", version="0.1.0")


class RunRequest(BaseModel):
    code: str = Field(max_length=MAX_SCRIPT_BYTES)


class Artifact(BaseModel):
    kind: str
    filename: str
    data_b64: str


class RunResponse(BaseModel):
    status: str  # "succeeded" | "failed" | "timeout"
    stdout: str
    stderr: str
    artifacts: list[Artifact]
    error_message: str | None = None


def _truncate(s: str, limit: int) -> str:
    if len(s.encode("utf-8")) <= limit:
        return s
    # Truncate by bytes to stay strictly under limit while keeping valid utf-8.
    encoded = s.encode("utf-8")[: limit - len(TRUNCATION_SUFFIX.encode("utf-8"))]
    return encoded.decode("utf-8", errors="ignore") + TRUNCATION_SUFFIX


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/run", response_model=RunResponse)
async def run(
    req: RunRequest,
    x_internal_api_token: Annotated[str | None, Header()] = None,
) -> RunResponse:
    if not INTERNAL_TOKEN or x_internal_api_token != INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API token",
        )

    with tempfile.TemporaryDirectory(prefix="nodeforge-run-") as tmp:
        tmp_path = Path(tmp)
        script_path = tmp_path / "script.py"
        script_path.write_text(req.code, encoding="utf-8")

        try:
            # Forcing matplotlib to the Agg backend via env is belt-and-braces
            # — the generated script also calls `matplotlib.use('Agg')` — but
            # belt-and-braces is cheap and protects against scripts importing
            # pyplot before our setup line.
            result = subprocess.run(
                ["python", str(script_path)],
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SECONDS,
                cwd=tmp,
                env={
                    **os.environ,
                    "MPLBACKEND": "Agg",
                    "PYTHONDONTWRITEBYTECODE": "1",
                },
            )
        except subprocess.TimeoutExpired as exc:
            return RunResponse(
                status="timeout",
                stdout=_truncate(exc.stdout or "", MAX_OUTPUT_BYTES),
                stderr=_truncate(exc.stderr or "", MAX_OUTPUT_BYTES),
                artifacts=[],
                error_message=f"Execution timed out after {TIMEOUT_SECONDS}s",
            )

        # Collect PNG artifacts written to the run's cwd. Skip the script
        # itself; everything else is treated as a user-produced file.
        artifacts: list[Artifact] = []
        for p in sorted(tmp_path.iterdir()):
            if p == script_path or not p.is_file():
                continue
            if p.suffix.lower() != ".png":
                continue
            artifacts.append(
                Artifact(
                    kind="image/png",
                    filename=p.name,
                    data_b64=base64.b64encode(p.read_bytes()).decode("ascii"),
                )
            )

        if result.returncode == 0:
            return RunResponse(
                status="succeeded",
                stdout=_truncate(result.stdout, MAX_OUTPUT_BYTES),
                stderr=_truncate(result.stderr, MAX_OUTPUT_BYTES),
                artifacts=artifacts,
            )

        return RunResponse(
            status="failed",
            stdout=_truncate(result.stdout, MAX_OUTPUT_BYTES),
            stderr=_truncate(result.stderr, MAX_OUTPUT_BYTES),
            artifacts=artifacts,
            error_message=f"Script exited with code {result.returncode}",
        )
