"""Runner coverage: job lifecycle and terminal, with the executor mocked.

The executor is replaced by an httpx.MockTransport so these tests never
spawn containers. `_run_in_background` normally opens its own session via
the module-level `SessionLocal`; we point it at the per-test engine.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.db.models import ExecutionJob
from src.runner import routes as runner_routes
from tests.helpers import create_project, login_as

BELL = {
    "nodes": [
        {"id": "h", "type": "qiskit.hadamard", "data": {"qubit_index": 0}},
        {"id": "run", "type": "qiskit.run_local_simulator", "data": {}},
    ],
    "edges": [{"id": "e", "source": "h", "target": "run"}],
}


@pytest.fixture
def executor(monkeypatch, engine) -> Callable[[Callable[[httpx.Request], httpx.Response]], list]:
    """Install a fake executor. Returns a setter taking a request handler;
    every request the backend sends is appended to the returned list."""
    monkeypatch.setattr(
        runner_routes,
        "SessionLocal",
        async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession),
    )
    real_client = httpx.AsyncClient

    def install(handler: Callable[[httpx.Request], httpx.Response]) -> list:
        seen: list[httpx.Request] = []

        def recording(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return handler(request)

        def fake_client(*args, **kwargs):
            return real_client(*args, transport=httpx.MockTransport(recording), **kwargs)

        monkeypatch.setattr(runner_routes.httpx, "AsyncClient", fake_client)
        return seen

    return install


async def _project_with_graph(client: AsyncClient, graph: dict) -> tuple[str, str]:
    p = await create_project(client)
    fid = p["files"][0]["id"]
    res = await client.patch(f"/projects/{p['id']}/files/{fid}", json={"graph_json": graph})
    assert res.status_code == 200
    return p["id"], fid


async def test_run_succeeds_and_job_is_pollable(client: AsyncClient, executor) -> None:
    seen = executor(
        lambda req: httpx.Response(
            200,
            json={
                "status": "succeeded",
                "stdout": "Counts: {'0': 1}\n",
                "stderr": "",
                "artifacts": [{"kind": "image/png", "filename": "h.png", "data_b64": "AA=="}],
            },
        )
    )
    await login_as(client, "a@example.com")
    pid, fid = await _project_with_graph(client, BELL)

    res = await client.post(f"/projects/{pid}/files/{fid}/run")
    assert res.status_code == 202
    job = res.json()
    assert job["status"] == "queued"

    # ASGITransport runs background tasks before returning, so the job is
    # already finished by the time we poll.
    polled = (await client.get(f"/jobs/{job['id']}")).json()
    assert polled["status"] == "succeeded"
    assert polled["stdout"] == "Counts: {'0': 1}\n"
    assert polled["artifacts_json"][0]["filename"] == "h.png"
    assert polled["started_at"] and polled["finished_at"]

    assert len(seen) == 1
    assert seen[0].url.path == "/run"
    assert seen[0].headers["x-internal-api-token"] == "test-internal-token"
    assert "qc.h(0)" in json.loads(seen[0].content)["code"]


async def test_run_executor_down_marks_job_error(client: AsyncClient, executor) -> None:
    def boom(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=req)

    executor(boom)
    await login_as(client, "a@example.com")
    pid, fid = await _project_with_graph(client, BELL)

    job = (await client.post(f"/projects/{pid}/files/{fid}/run")).json()
    polled = (await client.get(f"/jobs/{job['id']}")).json()
    assert polled["status"] == "error"
    assert polled["error_message"].startswith("Executor call failed:")


async def test_run_with_cycle_is_400_and_creates_no_job(client: AsyncClient, executor) -> None:
    seen = executor(lambda req: httpx.Response(500))
    await login_as(client, "a@example.com")
    cyclic = {
        "nodes": [{"id": "a", "type": "qiskit.hadamard"}, {"id": "b", "type": "qiskit.pauli_x"}],
        "edges": [{"source": "a", "target": "b"}, {"source": "b", "target": "a"}],
    }
    pid, fid = await _project_with_graph(client, cyclic)
    res = await client.post(f"/projects/{pid}/files/{fid}/run")
    assert res.status_code == 400
    assert seen == []


async def test_job_of_other_user_is_404(client: AsyncClient, executor) -> None:
    executor(lambda req: httpx.Response(200, json={"status": "succeeded"}))
    await login_as(client, "a@example.com")
    pid, fid = await _project_with_graph(client, BELL)
    job = (await client.post(f"/projects/{pid}/files/{fid}/run")).json()

    await login_as(client, "b@example.com")
    assert (await client.get(f"/jobs/{job['id']}")).status_code == 404


async def test_terminal_sends_preamble_history_and_command(client: AsyncClient, executor) -> None:
    seen = executor(
        lambda req: httpx.Response(200, json={"status": "succeeded", "stdout": "3\n", "stderr": ""})
    )
    await login_as(client, "a@example.com")
    pid, fid = await _project_with_graph(
        client, {"variables": [{"name": "n", "type": "Int", "value": "1"}]}
    )

    res = await client.post(
        f"/projects/{pid}/files/{fid}/terminal",
        json={"history": ["m = 2"], "command": "n + m"},
    )
    assert res.status_code == 200
    assert res.json() == {"stdout": "3\n", "stderr": "", "status": "succeeded"}

    code = json.loads(seen[0].content)["code"]
    assert repr("# Variables\nn: int = 1\nm = 2") in code
    assert "_CMD_SRC = 'n + m'" in code
    compile(code, "<wrapper>", "exec")


async def test_terminal_executor_down_returns_error_payload(client: AsyncClient, executor) -> None:
    def boom(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=req)

    executor(boom)
    await login_as(client, "a@example.com")
    pid, fid = await _project_with_graph(client, {})
    res = await client.post(f"/projects/{pid}/files/{fid}/terminal", json={"command": "1"})
    assert res.status_code == 200
    assert res.json()["status"] == "error"
    assert res.json()["stderr"].startswith("Executor call failed:")


async def test_run_is_rate_limited_per_user(client: AsyncClient, executor, limits_on) -> None:
    executor(lambda req: httpx.Response(200, json={"status": "succeeded"}))
    await login_as(client, "a@example.com")
    pid, fid = await _project_with_graph(client, BELL)
    url = f"/projects/{pid}/files/{fid}/run"

    for _ in range(20):
        assert (await client.post(url)).status_code == 202
    blocked = await client.post(url)
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "Too many requests, slow down"

    # The bucket is per account, not per IP: another user is unaffected.
    await login_as(client, "b@example.com")
    pid_b, fid_b = await _project_with_graph(client, BELL)
    assert (await client.post(f"/projects/{pid_b}/files/{fid_b}/run")).status_code == 202


async def test_job_polling_is_not_rate_limited(client: AsyncClient, executor, limits_on) -> None:
    executor(lambda req: httpx.Response(200, json={"status": "succeeded"}))
    await login_as(client, "a@example.com")
    pid, fid = await _project_with_graph(client, BELL)
    job = (await client.post(f"/projects/{pid}/files/{fid}/run")).json()
    for _ in range(100):
        assert (await client.get(f"/jobs/{job['id']}")).status_code == 200


async def test_terminal_is_rate_limited_per_user(client: AsyncClient, executor, limits_on) -> None:
    executor(lambda req: httpx.Response(200, json={"status": "succeeded", "stdout": ""}))
    await login_as(client, "a@example.com")
    pid, fid = await _project_with_graph(client, {})
    url = f"/projects/{pid}/files/{fid}/terminal"

    for _ in range(60):
        assert (await client.post(url, json={"command": "1"})).status_code == 200
    assert (await client.post(url, json={"command": "1"})).status_code == 429


async def test_terminal_surfaces_executor_error_message(client: AsyncClient, executor) -> None:
    executor(
        lambda req: httpx.Response(
            200,
            json={
                "status": "error",
                "stdout": "",
                "stderr": "",
                "artifacts": [],
                "error_message": "Executor is busy, try again in a few seconds",
            },
        )
    )
    await login_as(client, "a@example.com")
    pid, fid = await _project_with_graph(client, {})
    res = await client.post(f"/projects/{pid}/files/{fid}/terminal", json={"command": "1"})
    assert res.json() == {
        "stdout": "",
        "stderr": "Executor is busy, try again in a few seconds",
        "status": "error",
    }


# ---------- stop + live output ----------


async def _insert_job(session: AsyncSession, client: AsyncClient, job_status: str) -> str:
    """A job row in a given state, owned by the logged-in user."""
    pid, _ = await _project_with_graph(client, BELL)
    me = (await client.get("/auth/me")).json()
    job = ExecutionJob(project_id=uuid.UUID(pid), user_id=uuid.UUID(me["id"]), status=job_status)
    session.add(job)
    await session.commit()
    return str(job.id)


async def test_run_sends_run_id_to_executor(client: AsyncClient, executor) -> None:
    seen = executor(lambda req: httpx.Response(200, json={"status": "succeeded"}))
    await login_as(client, "a@example.com")
    pid, fid = await _project_with_graph(client, BELL)
    job = (await client.post(f"/projects/{pid}/files/{fid}/run")).json()
    assert json.loads(seen[0].content)["run_id"] == job["id"]


async def test_cancel_running_job_stops_the_container(
    client: AsyncClient, executor, session: AsyncSession
) -> None:
    seen = executor(lambda req: httpx.Response(200, json={"stopped": True}))
    await login_as(client, "a@example.com")
    job_id = await _insert_job(session, client, "running")

    res = await client.post(f"/jobs/{job_id}/cancel")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "cancelled"
    assert body["error_message"] == "Execution stopped by the user"
    assert body["finished_at"]
    assert [r.url.path for r in seen] == [f"/runs/{job_id}/stop"]
    assert seen[0].headers["x-internal-api-token"] == "test-internal-token"


async def test_cancel_survives_executor_down(
    client: AsyncClient, executor, session: AsyncSession
) -> None:
    def boom(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=req)

    executor(boom)
    await login_as(client, "a@example.com")
    job_id = await _insert_job(session, client, "running")
    res = await client.post(f"/jobs/{job_id}/cancel")
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"


async def test_cancel_finished_job_is_a_no_op(
    client: AsyncClient, executor, session: AsyncSession
) -> None:
    seen = executor(lambda req: httpx.Response(200, json={"stopped": True}))
    await login_as(client, "a@example.com")
    job_id = await _insert_job(session, client, "succeeded")
    res = await client.post(f"/jobs/{job_id}/cancel")
    assert res.status_code == 200
    assert res.json()["status"] == "succeeded"
    assert seen == []


async def test_cancel_job_of_other_user_is_404(
    client: AsyncClient, executor, session: AsyncSession
) -> None:
    executor(lambda req: httpx.Response(200, json={"stopped": True}))
    await login_as(client, "a@example.com")
    job_id = await _insert_job(session, client, "running")
    await login_as(client, "b@example.com")
    assert (await client.post(f"/jobs/{job_id}/cancel")).status_code == 404


async def test_job_cancelled_before_start_never_reaches_executor(
    client: AsyncClient, executor, session: AsyncSession
) -> None:
    seen = executor(lambda req: httpx.Response(200, json={"status": "succeeded"}))
    await login_as(client, "a@example.com")
    job_id = await _insert_job(session, client, "cancelled")
    await runner_routes._run_in_background(uuid.UUID(job_id), "print(1)")
    assert seen == []
    assert (await client.get(f"/jobs/{job_id}")).json()["status"] == "cancelled"


async def test_stop_during_run_keeps_cancelled_status_and_output(
    client: AsyncClient, executor, engine, session: AsyncSession
) -> None:
    await login_as(client, "a@example.com")
    job_id = await _insert_job(session, client, "queued")
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async def stop_mid_run(req: httpx.Request) -> httpx.Response:
        # The user presses Stop while the executor is still running.
        async with factory() as s:
            job = await s.get(ExecutionJob, uuid.UUID(job_id))
            job.status = "cancelled"
            job.error_message = "Execution stopped by the user"
            await s.commit()
        return httpx.Response(
            200,
            json={
                "status": "failed",
                "stdout": "partial\n",
                "stderr": "",
                "artifacts": [],
                "error_message": "Script exited with code 137",
            },
        )

    executor(stop_mid_run)
    await runner_routes._run_in_background(uuid.UUID(job_id), "print(1)")

    polled = (await client.get(f"/jobs/{job_id}")).json()
    assert polled["status"] == "cancelled"
    assert polled["error_message"] == "Execution stopped by the user"
    assert polled["stdout"] == "partial\n"


async def test_polling_running_job_returns_live_output(
    client: AsyncClient, executor, session: AsyncSession
) -> None:
    seen = executor(
        lambda req: httpx.Response(
            200, json={"running": True, "stdout": "step 1\n", "stderr": "warn\n"}
        )
    )
    await login_as(client, "a@example.com")
    job_id = await _insert_job(session, client, "running")

    polled = (await client.get(f"/jobs/{job_id}")).json()
    assert polled["status"] == "running"
    assert polled["stdout"] == "step 1\n"
    assert polled["stderr"] == "warn\n"
    assert [r.url.path for r in seen] == [f"/runs/{job_id}/logs"]


async def test_polling_survives_live_output_failure(
    client: AsyncClient, executor, session: AsyncSession
) -> None:
    executor(lambda req: httpx.Response(500))
    await login_as(client, "a@example.com")
    job_id = await _insert_job(session, client, "running")
    res = await client.get(f"/jobs/{job_id}")
    assert res.status_code == 200
    assert res.json()["stdout"] == ""
