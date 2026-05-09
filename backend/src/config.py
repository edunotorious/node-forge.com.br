from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7
    executor_url: str
    executor_timeout_seconds: int = 30
    cors_origins: str = "http://localhost:3000"
    internal_api_token: str


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
