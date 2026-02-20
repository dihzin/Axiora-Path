from pydantic import AliasChoices, Field
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
    auth_cookie_samesite: str = "lax"
    csrf_exempt_paths: str = "/health,/docs,/redoc,/openapi.json,/auth/login,/auth/signup"
    account_lock_max_attempts: int = 5
    account_lock_minutes: int = 15
    coin_conversion_coins_per_real: int = 10
    platform_admin_emails: str = ""
    llm_provider_key: str = Field(
        default="noop",
        validation_alias=AliasChoices("LLM_PROVIDER_KEY", "AXIORA_LLM_PROVIDER_KEY"),
    )
    llm_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("LLM_API_KEY", "AXIORA_LLM_API_KEY"),
    )
    llm_model: str | None = Field(
        default=None,
        validation_alias=AliasChoices("LLM_MODEL", "AXIORA_LLM_MODEL"),
    )


settings = Settings()
