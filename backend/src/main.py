from fastapi import FastAPI
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

app = FastAPI(title="Node-Forge API", version="0.1.0")
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
