from fastapi import FastAPI

from src.config import get_settings

settings = get_settings()

app = FastAPI(title="Node-Forge API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
