"""Auth flow coverage — register, login, me, logout, the error branches.

Rate limiting is disabled at the conftest level so we can stack
requests without artificial sleeps. The branches that DO depend on the
limiter (the 429 returning when /login is hit 6× in 60s) are exercised
in a dedicated test that explicitly re-enables the limiter.
"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import User

VALID_PASSWORD = "correct-horse-battery-staple"


async def test_register_creates_user(client: AsyncClient, session: AsyncSession) -> None:
    res = await client.post(
        "/auth/register",
        json={"email": "alice@example.com", "password": VALID_PASSWORD},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["email"] == "alice@example.com"
    assert "id" in body
    # Password hash should never round-trip out — bcrypt cost stays server-side.
    assert "password" not in body
    assert "password_hash" not in body

    # And it actually landed in the DB with a hashed value, not the raw one.
    stored = (
        await session.execute(select(User).where(User.email == "alice@example.com"))
    ).scalar_one()
    assert stored.password_hash != VALID_PASSWORD
    assert stored.password_hash.startswith("$2") or stored.password_hash.startswith("$argon")


async def test_register_normalizes_email_case(client: AsyncClient, session: AsyncSession) -> None:
    """Memory `project_email_normalization`: `.lower().strip()` at app layer.

    Mixed-case input must persist as lowercase so the unique constraint
    catches subsequent duplicate registrations.
    """
    res = await client.post(
        "/auth/register",
        json={"email": "  Bob@Example.COM  ", "password": VALID_PASSWORD},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["email"] == "bob@example.com"


async def test_register_rejects_duplicate(client: AsyncClient) -> None:
    payload = {"email": "carol@example.com", "password": VALID_PASSWORD}
    first = await client.post("/auth/register", json=payload)
    assert first.status_code == 201

    dup = await client.post("/auth/register", json=payload)
    assert dup.status_code == 409
    assert dup.json()["detail"] == "Email already registered"


async def test_register_rejects_short_password(client: AsyncClient) -> None:
    res = await client.post(
        "/auth/register",
        json={"email": "dave@example.com", "password": "short"},
    )
    # Pydantic schema validation fails before the handler — 422.
    assert res.status_code == 422


async def test_register_rejects_invalid_email(client: AsyncClient) -> None:
    res = await client.post(
        "/auth/register",
        json={"email": "not-an-email", "password": VALID_PASSWORD},
    )
    assert res.status_code == 422


async def test_login_success_sets_cookie(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "erin@example.com", "password": VALID_PASSWORD},
    )

    res = await client.post(
        "/auth/login",
        json={"email": "erin@example.com", "password": VALID_PASSWORD},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "access_token" in body

    cookies = res.headers.get_list("set-cookie")
    assert any("access_token=" in c for c in cookies)
    # httpOnly is non-negotiable — the BFF reads the cookie server-side
    # and the browser must never expose it to JS.
    assert any("HttpOnly" in c.lower() or "httponly" in c.lower() for c in cookies)
    assert any("samesite=lax" in c.lower() for c in cookies)


async def test_login_wrong_password_returns_401(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "frank@example.com", "password": VALID_PASSWORD},
    )

    res = await client.post(
        "/auth/login",
        json={"email": "frank@example.com", "password": "wrong-password-of-correct-length"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid credentials"


async def test_login_unknown_email_returns_same_401(client: AsyncClient) -> None:
    """Constant-time defence: an unknown email must look identical to a
    known email with a wrong password. No 404, no different error string.
    """
    res = await client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": VALID_PASSWORD},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid credentials"


async def test_me_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/auth/me")
    assert res.status_code == 401


async def test_me_returns_user_when_authenticated(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "gina@example.com", "password": VALID_PASSWORD},
    )
    login = await client.post(
        "/auth/login",
        json={"email": "gina@example.com", "password": VALID_PASSWORD},
    )
    assert login.status_code == 200

    # httpx persists the Set-Cookie between requests on the same client.
    me = await client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "gina@example.com"


async def test_logout_clears_cookie(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": "hank@example.com", "password": VALID_PASSWORD},
    )
    await client.post(
        "/auth/login",
        json={"email": "hank@example.com", "password": VALID_PASSWORD},
    )

    res = await client.post("/auth/logout")
    assert res.status_code == 204

    cookies = res.headers.get_list("set-cookie")
    # The expiry should be in the past (Max-Age=0 or 1970 Expires).
    assert any("access_token=" in c for c in cookies)
    assert any(("max-age=0" in c.lower()) or ("1970" in c) for c in cookies)


async def test_login_rate_limit_trips_when_enabled(monkeypatch, client: AsyncClient) -> None:
    """Belt-and-suspenders: flip the limiter back on and prove the 5/min
    ceiling actually returns 429 on the 6th attempt.

    Disabled for the rest of the suite via conftest; this single test
    asserts the production behaviour still works.
    """
    from src.auth import rate_limit as rl

    rl.limiter.enabled = True
    rl.limiter.reset()
    try:
        # 5 attempts under the limit, all 401s.
        for _ in range(5):
            res = await client.post(
                "/auth/login",
                json={"email": "ivy@example.com", "password": "anything"},
            )
            assert res.status_code == 401

        # The 6th in the same window should be 429.
        sixth = await client.post(
            "/auth/login",
            json={"email": "ivy@example.com", "password": "anything"},
        )
        assert sixth.status_code == 429
    finally:
        rl.limiter.enabled = False
        rl.limiter.reset()
