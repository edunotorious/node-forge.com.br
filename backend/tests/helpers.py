"""Shared test helpers (plain functions, not fixtures)."""

from __future__ import annotations

from httpx import AsyncClient

VALID_PASSWORD = "correct-horse-battery-staple"


async def login_as(client: AsyncClient, email: str) -> None:
    """Register `email` (if new) and log in, leaving the session cookie on
    `client`. Calling it again with another email switches users."""
    await client.post("/auth/register", json={"email": email, "password": VALID_PASSWORD})
    res = await client.post("/auth/login", json={"email": email, "password": VALID_PASSWORD})
    assert res.status_code == 200, res.text


async def create_project(client: AsyncClient, name: str = "Proj") -> dict:
    res = await client.post("/projects", json={"name": name})
    assert res.status_code == 201, res.text
    return res.json()
