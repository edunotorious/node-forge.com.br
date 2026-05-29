from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from src.auth.rate_limit import limiter
from src.auth.routes import router as auth_router
from src.config import get_settings
from src.projects.routes import router as projects_router
from src.runner.routes import router as runner_router
from src.users.routes import router as users_router

settings = get_settings()

# Parse the comma-separated CORS_ORIGINS env into a clean list. Empty
# entries (trailing commas, double commas) are dropped. The browser
# normally never talks here — the BFF proxy on Next is the only origin —
# but we keep this strict in case the API ever gets exposed directly.
_allowed_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

app = FastAPI(title="Node-Forge API", version="0.1.0")

# CORS first so preflights short-circuit before any other middleware fires.
# allow_credentials=True is required so the browser sends the httpOnly auth
# cookie on the rare direct calls; with credentials, allow_origins MUST be
# an explicit list (no "*"), which matches our settings.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Forwarded-For"],
    max_age=600,
)

# slowapi wiring — the limiter object needs to be reachable from the app
# state so route decorators can find it, plus the standard 429 handler.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(runner_router)
app.include_router(users_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
