from fastapi import FastAPI

from src.auth.routes import router as auth_router
from src.config import get_settings
from src.projects.routes import router as projects_router
from src.runner.routes import router as runner_router

settings = get_settings()

app = FastAPI(title="Node-Forge API", version="0.1.0")
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(runner_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
