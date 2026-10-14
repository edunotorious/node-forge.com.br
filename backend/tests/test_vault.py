"""Node Vault coverage: publish, browse, edit, republish, clone, like and
comment — including author-only permissions and the denormalized counters."""

from __future__ import annotations

from httpx import AsyncClient

from tests.helpers import create_project, login_as

GRAPH = {"nodes": [{"id": "h", "type": "qiskit.hadamard", "data": {}}], "edges": []}


async def _publish(client: AsyncClient, title: str = "Bell State", **extra) -> dict:
    p = await create_project(client)
    fid = p["files"][0]["id"]
    await client.patch(f"/projects/{p['id']}/files/{fid}", json={"graph_json": GRAPH})
    res = await client.post("/vault", json={"project_id": p["id"], "title": title, **extra})
    assert res.status_code == 201, res.text
    return {**res.json(), "_project_id": p["id"], "_file_id": fid}


async def test_publish_snapshots_files_and_normalizes_tags(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    listing = await _publish(client, tags=["Quantum Basics", "bell", "BELL"])
    assert listing["slug"].startswith("bell-state")
    assert listing["tags"] == ["quantum-basics", "bell"]
    assert listing["files"] == [{"name": "Arquivo 1", "position": 0, "graph_json": GRAPH}]
    assert listing["author"]["id"]
    assert (listing["clone_count"], listing["like_count"], listing["comment_count"]) == (0, 0, 0)


async def test_publish_rejects_bad_tag_and_foreign_project(client: AsyncClient) -> None:
    await login_as(client, "owner@example.com")
    p = await create_project(client)

    bad = await client.post("/vault", json={"project_id": p["id"], "title": "Ok", "tags": ["!"]})
    assert bad.status_code == 422

    await login_as(client, "other@example.com")
    res = await client.post("/vault", json={"project_id": p["id"], "title": "Stolen"})
    assert res.status_code == 404


async def test_same_title_gets_unique_slug(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    a = await _publish(client)
    b = await _publish(client)
    assert a["slug"] != b["slug"]


async def test_browse_is_public_and_filters(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    await _publish(client, "Grover search", tags=["search"])
    bell = await _publish(client, "Bell pair", description="entanglement", tags=["bell"])
    await client.post("/auth/logout")
    client.cookies.clear()

    listed = (await client.get("/vault")).json()
    assert {x["title"] for x in listed} == {"Grover search", "Bell pair"}
    assert all(x["liked_by_me"] is None for x in listed)
    assert "files" not in listed[0]

    assert [x["title"] for x in (await client.get("/vault?tag=bell")).json()] == ["Bell pair"]
    assert [x["title"] for x in (await client.get("/vault?q=ENTANGLE")).json()] == ["Bell pair"]

    detail = await client.get(f"/vault/{bell['slug']}")
    assert detail.status_code == 200
    assert detail.json()["files"][0]["graph_json"] == GRAPH
    assert (await client.get("/vault/does-not-exist")).status_code == 404


async def test_only_author_can_edit_republish_delete(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    listing = await _publish(client)
    lid = listing["id"]

    await login_as(client, "other@example.com")
    assert (await client.patch(f"/vault/{lid}", json={"title": "Hacked"})).status_code == 404
    assert (await client.post(f"/vault/{lid}/republish")).status_code == 404
    assert (await client.delete(f"/vault/{lid}")).status_code == 404

    await login_as(client, "author@example.com")
    res = await client.patch(f"/vault/{lid}", json={"title": "Renamed", "tags": ["new"]})
    assert res.status_code == 200
    assert res.json()["title"] == "Renamed"
    assert res.json()["tags"] == ["new"]


async def test_republish_refreshes_snapshot(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    listing = await _publish(client)
    new_graph = {"nodes": [], "edges": [], "config": {"num_qubits": 5}}
    await client.patch(
        f"/projects/{listing['_project_id']}/files/{listing['_file_id']}",
        json={"graph_json": new_graph},
    )
    res = await client.post(f"/vault/{listing['id']}/republish")
    assert res.status_code == 200
    assert res.json()["files"][0]["graph_json"] == new_graph


async def test_republish_after_source_deleted_is_409(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    listing = await _publish(client)
    await client.delete(f"/projects/{listing['_project_id']}")
    assert (await client.post(f"/vault/{listing['id']}/republish")).status_code == 409
    # The listing itself survives its source project.
    assert (await client.get(f"/vault/{listing['slug']}")).status_code == 200


async def test_clone_creates_project_for_caller(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    listing = await _publish(client)

    await login_as(client, "fan@example.com")
    res = await client.post(f"/vault/{listing['id']}/clone")
    assert res.status_code == 200
    project = (await client.get(f"/projects/{res.json()['project_id']}")).json()
    assert project["name"] == "Bell State (clone)"
    file_url = f"/projects/{project['id']}/files/{project['files'][0]['id']}"
    assert (await client.get(file_url)).json()["graph_json"] == GRAPH

    assert (await client.get(f"/vault/{listing['slug']}")).json()["clone_count"] == 1


async def test_like_is_idempotent_and_counted(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    listing = await _publish(client)
    url = f"/vault/{listing['id']}/like"

    await login_as(client, "fan@example.com")
    assert (await client.post(url)).status_code == 204
    assert (await client.post(url)).status_code == 204
    detail = (await client.get(f"/vault/{listing['slug']}")).json()
    assert detail["like_count"] == 1
    assert detail["liked_by_me"] is True

    assert (await client.delete(url)).status_code == 204
    assert (await client.delete(url)).status_code == 204
    detail = (await client.get(f"/vault/{listing['slug']}")).json()
    assert detail["like_count"] == 0
    assert detail["liked_by_me"] is False


async def test_comments_add_list_soft_delete(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    listing = await _publish(client)
    base = f"/vault/{listing['id']}/comments"

    await login_as(client, "fan@example.com")
    res = await client.post(base, json={"body": "  nice circuit  "})
    assert res.status_code == 201
    comment = res.json()
    assert comment["body"] == "nice circuit"

    # Only the comment's author can delete it.
    await login_as(client, "author@example.com")
    assert (await client.delete(f"{base}/{comment['id']}")).status_code == 404

    await login_as(client, "fan@example.com")
    assert (await client.delete(f"{base}/{comment['id']}")).status_code == 204

    listed = (await client.get(base)).json()
    assert len(listed) == 1
    assert listed[0]["deleted"] is True
    assert listed[0]["body"] == "[deleted]"
    assert (await client.get(f"/vault/{listing['slug']}")).json()["comment_count"] == 0


async def test_vault_writes_require_auth(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    listing = await _publish(client)
    await client.post("/auth/logout")
    client.cookies.clear()

    lid = listing["id"]
    assert (await client.post(f"/vault/{lid}/like")).status_code == 401
    assert (await client.post(f"/vault/{lid}/clone")).status_code == 401
    assert (await client.post(f"/vault/{lid}/comments", json={"body": "x"})).status_code == 401


async def test_publish_defaults_to_free_and_reports_snapshot_stats(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    listing = await _publish(client)
    assert (listing["price_cents"], listing["currency"], listing["locked"]) == (0, "BRL", False)
    assert (listing["file_count"], listing["node_count"]) == (1, 1)


async def test_price_validation(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    p = await create_project(client)
    for bad in (-1, 50, 1_000_001):
        res = await client.post(
            "/vault", json={"project_id": p["id"], "title": "Paid", "price_cents": bad}
        )
        assert res.status_code == 422, bad

    listing = await _publish(client)
    res = await client.patch(f"/vault/{listing['id']}", json={"price_cents": 99})
    assert res.status_code == 422
    res = await client.patch(f"/vault/{listing['id']}", json={"price_cents": 2990})
    assert res.json()["price_cents"] == 2990
    # Omitting the price on a later edit keeps it.
    res = await client.patch(f"/vault/{listing['id']}", json={"title": "Renamed"})
    assert res.json()["price_cents"] == 2990


async def test_paid_listing_is_preview_only_except_for_author(client: AsyncClient) -> None:
    graph = {**GRAPH, "config": {"num_qubits": 3, "shots": 512}}
    await login_as(client, "author@example.com")
    p = await create_project(client)
    fid = p["files"][0]["id"]
    await client.patch(f"/projects/{p['id']}/files/{fid}", json={"graph_json": graph})
    res = await client.post(
        "/vault", json={"project_id": p["id"], "title": "Premium", "price_cents": 4990}
    )
    listing = res.json()
    assert listing["locked"] is False
    assert listing["files"][0]["graph_json"] == graph

    # The author still clones their own listing.
    assert (await client.post(f"/vault/{listing['id']}/clone")).status_code == 200

    for who in ("buyer@example.com", None):
        if who:
            await login_as(client, who)
        else:
            await client.post("/auth/logout")
            client.cookies.clear()
        detail = (await client.get(f"/vault/{listing['slug']}")).json()
        assert detail["locked"] is True
        assert detail["files"] == [
            {"name": "Arquivo 1", "position": 0, "graph_json": {"config": graph["config"]}}
        ]
        # The cards still advertise the size of what is being sold.
        assert (detail["node_count"], detail["num_qubits"]) == (1, 3)

    await login_as(client, "buyer@example.com")
    assert (await client.post(f"/vault/{listing['id']}/clone")).status_code == 402
    assert (await client.get(f"/vault/{listing['slug']}")).json()["clone_count"] == 1


async def test_price_filter_and_sort(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    await _publish(client, "Free one")
    await _publish(client, "Cheap", price_cents=990)
    await _publish(client, "Pricey", price_cents=9990)

    def titles(res) -> list[str]:
        return [x["title"] for x in res.json()]

    assert titles(await client.get("/vault?price=free")) == ["Free one"]
    assert set(titles(await client.get("/vault?price=paid"))) == {"Cheap", "Pricey"}
    assert titles(await client.get("/vault?price=paid&sort=price_asc")) == ["Cheap", "Pricey"]
    assert titles(await client.get("/vault?sort=price_desc")) == ["Pricey", "Cheap", "Free one"]
    assert (await client.get("/vault?price=gratis")).status_code == 422


async def test_popular_tags_are_counted(client: AsyncClient) -> None:
    await login_as(client, "author@example.com")
    await _publish(client, "Alpha", tags=["bell", "basics"])
    await _publish(client, "Beta", tags=["bell"])
    await client.post("/auth/logout")
    client.cookies.clear()

    res = await client.get("/vault/tags")
    assert res.status_code == 200
    assert res.json() == [{"tag": "bell", "count": 2}, {"tag": "basics", "count": 1}]
    assert len((await client.get("/vault/tags?limit=1")).json()) == 1
