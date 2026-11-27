"""Feedback: public community wall, anonymous posting, author-only delete."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import Feedback
from tests.helpers import VALID_PASSWORD, login_as


async def _set_username(client: AsyncClient, username: str) -> None:
    res = await client.patch(
        "/auth/me/username",
        json={"current_password": VALID_PASSWORD, "new_username": username},
    )
    assert res.status_code == 200, res.text


async def test_feedback_is_stored_with_user_page_and_rating(
    client: AsyncClient, session: AsyncSession
) -> None:
    await login_as(client, "a@example.com")
    res = await client.post(
        "/feedback",
        json={"message": "  Não achei o botão de rodar  ", "rating": 4, "page": "/projects/abc"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["message"] == "Não achei o botão de rodar"
    assert body["rating"] == 4
    assert body["mine"] is True
    # The page path stays private (it can hold project ids).
    assert "page" not in body

    rows = (await session.execute(select(Feedback))).scalars().all()
    assert len(rows) == 1
    assert rows[0].user_id is not None
    assert rows[0].page == "/projects/abc"


async def test_wall_is_public_and_never_leaks_email_or_page(client: AsyncClient) -> None:
    await login_as(client, "ana@example.com")
    await _set_username(client, "ana_q")
    await client.post("/feedback", json={"message": "Gostei do exemplo", "rating": 5, "page": "/x"})
    await client.post("/auth/logout")

    res = await client.get("/feedback")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["author"]["username"] == "ana_q"
    assert item["mine"] is False
    assert "ana@example.com" not in res.text
    assert "page" not in item


async def test_anonymous_feedback_hides_the_author(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    await _set_username(client, "segredo")
    res = await client.post("/feedback", json={"message": "Sem nome", "anonymous": True})
    assert res.status_code == 201
    assert res.json()["author"] is None

    # The author still recognises it as theirs (to delete it)…
    mine = (await client.get("/feedback")).json()["items"][0]
    assert mine["anonymous"] is True and mine["mine"] is True
    # …but nobody else learns who wrote it.
    await login_as(client, "b@example.com")
    res = await client.get("/feedback")
    assert res.json()["items"][0]["author"] is None
    assert res.json()["items"][0]["mine"] is False
    assert "segredo" not in res.text


async def test_wall_is_newest_first_paginated_and_averaged(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    for msg, rating in [("primeiro", 2), ("segundo", None), ("terceiro", 5)]:
        payload = {"message": msg} | ({"rating": rating} if rating else {})
        assert (await client.post("/feedback", json=payload)).status_code == 201

    page1 = (await client.get("/feedback?limit=2")).json()
    assert [i["message"] for i in page1["items"]] == ["terceiro", "segundo"]
    assert page1["total"] == 3
    assert page1["rated_count"] == 2
    assert page1["average_rating"] == 3.5
    page2 = (await client.get("/feedback?limit=2&offset=2")).json()
    assert [i["message"] for i in page2["items"]] == ["primeiro"]


async def test_empty_wall(client: AsyncClient) -> None:
    body = (await client.get("/feedback")).json()
    assert body == {"items": [], "total": 0, "average_rating": None, "rated_count": 0}


async def test_only_the_author_can_delete(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    fid = (await client.post("/feedback", json={"message": "apagar depois"})).json()["id"]

    await login_as(client, "b@example.com")
    assert (await client.delete(f"/feedback/{fid}")).status_code == 404
    await client.post("/auth/logout")
    assert (await client.delete(f"/feedback/{fid}")).status_code == 401

    await login_as(client, "a@example.com")
    assert (await client.delete(f"/feedback/{fid}")).status_code == 204
    assert (await client.get("/feedback")).json()["total"] == 0


async def test_feedback_rating_is_optional(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    res = await client.post("/feedback", json={"message": "Gostei"})
    assert res.status_code == 201
    assert res.json()["rating"] is None


async def test_posting_requires_login(client: AsyncClient) -> None:
    assert (await client.post("/feedback", json={"message": "oi oi"})).status_code == 401


async def test_feedback_validates_input(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    bad = [
        {"message": "ok"},
        {"message": "x" * 2001},
        {"message": "válido", "rating": 0},
        {"message": "válido", "rating": 6},
        {"message": "válido", "page": "https://evil.example/x"},
        {"message": "válido", "page": "/projects?token=abc"},
    ]
    for payload in bad:
        assert (await client.post("/feedback", json=payload)).status_code == 422, payload
    assert (await client.get("/feedback?limit=51")).status_code == 422


async def test_feedback_is_rate_limited(client: AsyncClient, limits_on) -> None:
    await login_as(client, "a@example.com")
    for _ in range(10):
        assert (await client.post("/feedback", json={"message": "mais um"})).status_code == 201
    assert (await client.post("/feedback", json={"message": "mais um"})).status_code == 429
