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
    # Cookie `Secure` flag for the auth cookie. True in production. Browsers
    # grant a localhost exception so True works for browser dev too, but curl
    # over plain HTTP refuses to send Secure cookies — set False in .env when
    # exercising endpoints with curl/cookies.txt.
    cookie_secure: bool = True
    # Outbound email. `stdout` keeps the dev-only "print the link to logs"
    # behaviour; flip to `resend` in prod to actually send via the Resend
    # API (https://resend.com).
    email_backend: str = "stdout"
    email_from: str = "Node-Forge <onboarding@resend.dev>"
    resend_api_key: str = ""
    # Used to build absolute URLs inside the email body. Browser-facing
    # origin — http://localhost:3000 in dev, https://node-forge.com.br
    # once deployed.
    app_base_url: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
