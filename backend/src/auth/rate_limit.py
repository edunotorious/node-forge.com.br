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

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


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
)
