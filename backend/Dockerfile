# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

# uv binary from the official image (pinned).
COPY --from=ghcr.io/astral-sh/uv:0.11.12 /uv /uvx /usr/local/bin/

WORKDIR /app

# Install dependencies first (cache-friendly: this layer only invalidates
# when pyproject.toml or uv.lock change).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# App code. In dev this gets overlaid by a bind-mount from docker-compose.
COPY src ./src
COPY alembic.ini ./
COPY alembic ./alembic

EXPOSE 8000

# --no-sync skips the implicit lock check on every `uv run`; image was already
# synced above, and re-syncing on each container start would touch the
# bind-mounted source.
#
# Dev convenience: run any pending alembic migrations on startup so a fresh
# build is always at head before uvicorn comes up. Postgres readiness is
# already gated by docker-compose's
# `depends_on: postgres: condition: service_healthy`. Production must NOT
# do this — use a separate pre-deploy migration job and gate the deploy on
# its success.
CMD ["sh", "-c", "uv run --no-sync alembic upgrade head && exec uv run --no-sync uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload"]
