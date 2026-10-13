"""Rate limiting for auth endpoints.

bcrypt cost 12 alone doesn't stop distributed brute force — an attacker
with N hosts can still drive N * ~5 attempts/sec per host against /login.
slowapi gives us per-IP buckets that bound the per-source rate cheaply.

Why in-memory storage:
    Single backend worker today (see Dockerfile CMD — uvicorn --reload, no
    --workers flag). In-memory is fine and avoids a redis dependency.
    When we go multi-worker, set RATE_LIMIT_STORAGE_URL=redis://... in the
    env and slowapi will pick it up automatically — every bucket becomes
    shared.

Why X-Forwarded-For:
    All real traffic comes through the Next.js BFF. `request.client.host`
    would be the BFF's container IP, making all users share a single
    bucket. Next.js sets x-forwarded-for to the actual user IP per its
    proxy convention; we read the FIRST entry (left-most, set by the
    edge closest to the user).
"""

from __future__ import annotations

import os
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from limits import parse
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.auth.deps import get_current_user
from src.db.models import User


def _client_ip(request: Request) -> str:
    # X-Forwarded-For is "client, proxy1, proxy2…". Take the left-most.
    # If absent (direct host hit, e.g. curl against :8000) fall back to
    # the socket peer.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(
    key_func=_client_ip,
    storage_uri=os.environ.get("RATE_LIMIT_STORAGE_URL", "memory://"),
    # default_limits empty: each endpoint declares its own ceiling. A blanket
    # default would silently rate-limit endpoints we don't want to (project
    # CRUD, file reads, autosave).
    default_limits=[],
    # Tests set RATE_LIMIT_ENABLED=false so registering 10+ users in a row
    # doesn't trip the per-IP buckets. Production never sets this.
    enabled=os.environ.get("RATE_LIMIT_ENABLED", "true").lower() != "false",
)


def per_user_limit(scope: str, limit: str) -> Callable[..., Awaitable[User]]:
    """Dependency that authenticates the caller AND counts the request
    against a per-user bucket. Use it in place of `get_current_user` on
    endpoints that are expensive per call (each /run and /terminal spawns
    a sandbox container).

    Keyed by user id rather than IP: these endpoints are authenticated, so
    the account is the natural unit, and it cannot be dodged by spoofing
    X-Forwarded-For. Shares the limiter's storage (and its `enabled`
    switch, so tests stay unaffected).
    """
    item = parse(limit)

    async def dependency(user: Annotated[User, Depends(get_current_user)]) -> User:
        if limiter.enabled and not limiter.limiter.hit(item, scope, str(user.id)):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests, slow down",
            )
        return user

    return dependency
