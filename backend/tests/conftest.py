"""Test fixtures for backend pytest suite.

Strategy:
    - Each test session connects to a separate Postgres database derived
      from DATABASE_URL_TEST (or a default that mirrors the dev URL with a
      `_test` suffix). The schema is dropped + recreated from SQLAlchemy
      metadata at the start of each test, NOT via Alembic. Alembic is
      validated by a dedicated migrations test elsewhere; here we want
      fast, deterministic schema per test run.
    - Rate limiting is disabled via the RATE_LIMIT_ENABLED env var so
      tests can hammer /auth/* without tripping the per-IP buckets.
    - The app's `get_session` dependency is overridden to share the same
      engine the test fixtures use, so writes from a test are visible in
      the same transaction the app handler reads from.
"""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator

# Set env BEFORE any src.* import so the limiter sees enabled=false and the
# settings see the test DB URL.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get(
        "DATABASE_URL_TEST",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/nodeforge_test",
    ),
)
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-not-used-anywhere-real")
os.environ.setdefault("EXECUTOR_URL", "http://executor:8001")
os.environ.setdefault("INTERNAL_API_TOKEN", "test-internal-token")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("EMAIL_BACKEND", "stdout")
os.environ.setdefault("APP_BASE_URL", "http://localhost:3000")

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool  # noqa: E402

from src.db.models import Base  # noqa: E402
from src.db.session import get_session  # noqa: E402
from src.main import app  # noqa: E402


@pytest_asyncio.fixture
async def engine():
    """Per-test engine pointing at the test database.

    Function-scoped because asyncpg attaches Futures to the event loop
    that created them; pytest-asyncio creates a fresh loop per test
    function by default, so a session-scoped engine triggers
    "Future attached to a different loop" on the second test. Cost
    of a per-test engine is one connection setup — a few ms on
    localhost.
    """
    db_url = os.environ["DATABASE_URL"]
    # NullPool prevents asyncpg connections from being checked back into a
    # pool whose creating loop has already closed — every transaction gets
    # a fresh, single-use connection.
    eng = create_async_engine(db_url, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest_asyncio.fixture
async def session(engine) -> AsyncGenerator[AsyncSession, None]:
    """A fresh AsyncSession for direct DB assertions inside a test."""
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as s:
        yield s


@pytest_asyncio.fixture
async def client(engine) -> AsyncGenerator[AsyncClient, None]:
    """In-process httpx client bound to the FastAPI app via ASGITransport."""
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async def _override_get_session() -> AsyncGenerator[AsyncSession, None]:
        async with factory() as s:
            yield s

    app.dependency_overrides[get_session] = _override_get_session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_session, None)
