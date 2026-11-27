"""In-app feedback (the Feedback button)."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import Feedback
from tests.helpers import login_as


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
    assert body["page"] == "/projects/abc"

    rows = (await session.execute(select(Feedback))).scalars().all()
    assert len(rows) == 1
    assert rows[0].user_id is not None


async def test_feedback_rating_is_optional(client: AsyncClient) -> None:
    await login_as(client, "a@example.com")
    res = await client.post("/feedback", json={"message": "Gostei"})
    assert res.status_code == 201
    assert res.json()["rating"] is None
    assert res.json()["page"] == ""


async def test_feedback_requires_login(client: AsyncClient) -> None:
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


async def test_feedback_is_rate_limited(client: AsyncClient, limits_on) -> None:
    await login_as(client, "a@example.com")
    for _ in range(10):
        assert (await client.post("/feedback", json={"message": "mais um"})).status_code == 201
    assert (await client.post("/feedback", json={"message": "mais um"})).status_code == 429
