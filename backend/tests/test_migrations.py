"""Alembic ↔ models drift check.

The rest of the suite builds its schema with `Base.metadata.create_all`,
so nothing else proves the migrations produce the schema the models
describe. This test wipes the test database, runs `alembic upgrade head`,
then asks autogenerate for a diff — any entry means a model changed
without a migration (or vice versa).

Sync test on purpose: alembic's env.py calls `asyncio.run`, which cannot
nest inside pytest-asyncio's running loop.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from src.db.models import Base

BACKEND_DIR = Path(__file__).resolve().parent.parent


async def _reset_schema(url: str) -> None:
    eng = create_async_engine(url, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await eng.dispose()


async def _diff(url: str) -> list:
    eng = create_async_engine(url, poolclass=NullPool)
    async with eng.connect() as conn:
        diff = await conn.run_sync(
            lambda sync_conn: compare_metadata(
                MigrationContext.configure(
                    sync_conn,
                    opts={"compare_type": True, "compare_server_default": True},
                ),
                Base.metadata,
            )
        )
    await eng.dispose()
    return diff


def test_migrations_match_models() -> None:
    url = os.environ["DATABASE_URL"]
    asyncio.run(_reset_schema(url))

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")

    assert asyncio.run(_diff(url)) == []
