from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AXIORA_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    redis_url: str
    jwt_secret: str
    app_env: str = "development"
    data_retention_days: int = 30
    queue_name: str = "axiora:jobs"
    cors_allowed_origins: str = "http://localhost:3000"
    auth_cookie_secure: bool = True
    auth_cookie_domain: str | None = None
    csrf_exempt_paths: str = "/health,/docs,/redoc,/openapi.json,/auth/login,/auth/signup"
    account_lock_max_attempts: int = 5
    account_lock_minutes: int = 15


settings = Settings()
