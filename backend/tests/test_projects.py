"""Projects + files coverage: CRUD, ownership isolation, the last-file rule,
duplicate naming and thumbnail validation."""

from __future__ import annotations

import uuid

from httpx import AsyncClient

from tests.helpers import create_project, login_as

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


async def test_projects_require_auth(client: AsyncClient) -> None:
    assert (await client.get("/projects")).status_code == 401
    assert (await client.post("/projects", json={"name": "x"})).status_code == 401


async def test_create_project_has_default_file(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    project = await create_project(client, "Bell")
    assert project["name"] == "Bell"
    assert [f["name"] for f in project["files"]] == ["Arquivo 1"]
    assert project["has_thumbnail"] is False

    file_id = project["files"][0]["id"]
    res = await client.get(f"/projects/{project['id']}/files/{file_id}")
    assert res.status_code == 200
    assert res.json()["graph_json"] == {
        "nodes": [],
        "edges": [],
        "config": {"num_qubits": 2, "num_classical": 2, "shots": 1000},
    }


async def test_list_update_delete_project(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    p = await create_project(client, "One")

    res = await client.patch(f"/projects/{p['id']}", json={"name": "Renamed"})
    assert res.status_code == 200
    assert res.json()["name"] == "Renamed"

    listed = (await client.get("/projects")).json()
    assert [x["name"] for x in listed] == ["Renamed"]
    assert "files" not in listed[0]

    assert (await client.delete(f"/projects/{p['id']}")).status_code == 204
    assert (await client.get(f"/projects/{p['id']}")).status_code == 404


async def test_other_users_project_is_404_everywhere(client: AsyncClient) -> None:
    await login_as(client, "owner@example.com")
    p = await create_project(client)
    pid, fid = p["id"], p["files"][0]["id"]

    await login_as(client, "intruder@example.com")
    assert (await client.get("/projects")).json() == []
    assert (await client.get(f"/projects/{pid}")).status_code == 404
    assert (await client.patch(f"/projects/{pid}", json={"name": "x"})).status_code == 404
    assert (await client.delete(f"/projects/{pid}")).status_code == 404
    assert (await client.get(f"/projects/{pid}/files/{fid}")).status_code == 404
    assert (
        await client.patch(f"/projects/{pid}/files/{fid}", json={"graph_json": {}})
    ).status_code == 404
    assert (await client.post(f"/projects/{pid}/duplicate")).status_code == 404
    assert (await client.get(f"/projects/{pid}/thumbnail")).status_code == 404
    assert (await client.post(f"/projects/{pid}/files/{fid}/run")).status_code == 404

    # Owner still has it, untouched.
    await login_as(client, "owner@example.com")
    assert (await client.get(f"/projects/{pid}")).json()["name"] == "Proj"


async def test_unknown_project_is_404(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    assert (await client.get(f"/projects/{uuid.uuid4()}")).status_code == 404


async def test_file_crud_and_name_conflict(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    p = await create_project(client)
    base = f"/projects/{p['id']}/files"

    res = await client.post(base, json={"name": "Arquivo 2", "graph_json": {"nodes": []}})
    assert res.status_code == 201
    f2 = res.json()
    assert f2["position"] == 1
    assert f2["graph_json"] == {"nodes": []}

    dup = await client.post(base, json={"name": "Arquivo 2"})
    assert dup.status_code == 409

    rename_clash = await client.patch(f"{base}/{f2['id']}", json={"name": "Arquivo 1"})
    assert rename_clash.status_code == 409

    graph = {"nodes": [{"id": "h", "type": "qiskit.hadamard", "data": {}}], "edges": []}
    res = await client.patch(f"{base}/{f2['id']}", json={"graph_json": graph, "position": 5})
    assert res.status_code == 200
    assert res.json()["graph_json"] == graph
    assert res.json()["position"] == 5

    assert (await client.delete(f"{base}/{f2['id']}")).status_code == 204
    assert (await client.get(f"{base}/{f2['id']}")).status_code == 404


async def test_cannot_delete_last_file(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    p = await create_project(client)
    fid = p["files"][0]["id"]
    res = await client.delete(f"/projects/{p['id']}/files/{fid}")
    assert res.status_code == 400
    assert res.json()["detail"] == "Cannot delete the last file of a project"


async def test_duplicate_copies_files_and_picks_free_name(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    p = await create_project(client, "Src")
    graph = {"nodes": [{"id": "x"}], "edges": []}
    fid = p["files"][0]["id"]
    await client.patch(f"/projects/{p['id']}/files/{fid}", json={"graph_json": graph})

    first = (await client.post(f"/projects/{p['id']}/duplicate")).json()
    second = (await client.post(f"/projects/{p['id']}/duplicate")).json()
    assert first["name"] == "Src (copy)"
    assert second["name"] == "Src (copy 2)"
    assert first["id"] != p["id"]

    copied_fid = first["files"][0]["id"]
    assert copied_fid != fid
    copied = (await client.get(f"/projects/{first['id']}/files/{copied_fid}")).json()
    assert copied["graph_json"] == graph


async def test_thumbnail_roundtrip_and_validation(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    p = await create_project(client)
    url = f"/projects/{p['id']}/thumbnail"

    assert (await client.get(url)).status_code == 404

    jpeg = await client.put(url, files={"file": ("t.jpg", b"\xff\xd8\xff", "image/jpeg")})
    assert jpeg.status_code == 400

    fake_png = await client.put(url, files={"file": ("t.png", b"not a png", "image/png")})
    assert fake_png.status_code == 400

    too_big = PNG_BYTES + b"\x00" * 1_048_576
    assert (
        await client.put(url, files={"file": ("t.png", too_big, "image/png")})
    ).status_code == 413

    ok = await client.put(url, files={"file": ("t.png", PNG_BYTES, "image/png")})
    assert ok.status_code == 204
    got = await client.get(url)
    assert got.status_code == 200
    assert got.content == PNG_BYTES
    assert got.headers["cache-control"] == "no-store"
    assert (await client.get(f"/projects/{p['id']}")).json()["has_thumbnail"] is True

    assert (await client.delete(url)).status_code == 204
    assert (await client.get(url)).status_code == 404
