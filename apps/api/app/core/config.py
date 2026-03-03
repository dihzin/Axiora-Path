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
    platform_super_admin_emails: str = ""
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
    git_sha: str | None = Field(
        default=None,
        validation_alias=AliasChoices("GIT_SHA", "RENDER_GIT_COMMIT", "AXIORA_GIT_SHA"),
    )
    build_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("BUILD_ID", "RENDER_SERVICE_ID", "AXIORA_BUILD_ID"),
    )
    experiment_can_override_plan: bool | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "EXPERIMENT_CAN_OVERRIDE_PLAN",
            "AXIORA_EXPERIMENT_CAN_OVERRIDE_PLAN",
        ),
    )
    axion_production_rollout_percent: int = Field(
        default=100,
        validation_alias=AliasChoices(
            "AXION_PRODUCTION_ROLLOUT_PERCENT",
            "AXIORA_AXION_PRODUCTION_ROLLOUT_PERCENT",
        ),
    )
    auto_scale_rollout_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "AUTO_SCALE_ROLLOUT_ENABLED",
            "AXIORA_AUTO_SCALE_ROLLOUT_ENABLED",
        ),
    )
    axion_health_runner_enabled: bool | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "AXION_HEALTH_RUNNER_ENABLED",
            "AXIORA_AXION_HEALTH_RUNNER_ENABLED",
        ),
    )
    axion_health_runner_mode: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "AXION_HEALTH_RUNNER_MODE",
            "AXIORA_AXION_HEALTH_RUNNER_MODE",
        ),
    )
    axion_health_runner_cron_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "AXION_HEALTH_RUNNER_CRON_SECRET",
            "AXIORA_AXION_HEALTH_RUNNER_CRON_SECRET",
        ),
    )
    axion_health_runner_cron_secrets: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "AXION_HEALTH_RUNNER_CRON_SECRETS",
            "AXIORA_AXION_HEALTH_RUNNER_CRON_SECRETS",
        ),
    )
    axion_health_runner_timeout_seconds: int = Field(
        default=30,
        validation_alias=AliasChoices(
            "AXION_HEALTH_RUNNER_TIMEOUT_SECONDS",
            "AXIORA_AXION_HEALTH_RUNNER_TIMEOUT_SECONDS",
        ),
    )
    axion_health_runner_rate_limit_max: int | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "AXION_HEALTH_RUNNER_RATE_LIMIT_MAX",
            "AXIORA_AXION_HEALTH_RUNNER_RATE_LIMIT_MAX",
        ),
    )
    axion_health_runner_rate_limit_window_seconds: int | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "AXION_HEALTH_RUNNER_RATE_LIMIT_WINDOW_SECONDS",
            "AXIORA_AXION_HEALTH_RUNNER_RATE_LIMIT_WINDOW_SECONDS",
        ),
    )
    axion_health_runner_allowlist: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "AXION_HEALTH_RUNNER_ALLOWLIST",
            "AXIORA_AXION_HEALTH_RUNNER_ALLOWLIST",
        ),
    )
    axion_alert_webhook_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "AXION_ALERT_WEBHOOK_URL",
            "AXIORA_AXION_ALERT_WEBHOOK_URL",
        ),
    )
    axion_min_sample_size: int = Field(
        default=200,
        validation_alias=AliasChoices(
            "AXION_MIN_SAMPLE_SIZE",
            "AXIORA_AXION_MIN_SAMPLE_SIZE",
        ),
    )
    axion_min_days_between_rollout_increase: int = Field(
        default=7,
        validation_alias=AliasChoices(
            "AXION_MIN_DAYS_BETWEEN_ROLLOUT_INCREASE",
            "AXIORA_AXION_MIN_DAYS_BETWEEN_ROLLOUT_INCREASE",
        ),
    )
    axion_feature_store_warn_threshold: int = Field(
        default=10000,
        validation_alias=AliasChoices(
            "AXION_FEATURE_STORE_WARN_THRESHOLD",
            "AXIORA_AXION_FEATURE_STORE_WARN_THRESHOLD",
        ),
    )
    axion_epsilon: float = Field(
        default=0.1,
        validation_alias=AliasChoices(
            "AXION_EPSILON",
            "AXIORA_AXION_EPSILON",
        ),
    )
    axion_feature_drift_warn_threshold: float = Field(
        default=0.2,
        validation_alias=AliasChoices(
            "AXION_FEATURE_DRIFT_WARN_THRESHOLD",
            "AXIORA_AXION_FEATURE_DRIFT_WARN_THRESHOLD",
        ),
    )
    axion_outcome_drift_warn_pct: float = Field(
        default=20.0,
        validation_alias=AliasChoices(
            "AXION_OUTCOME_DRIFT_WARN_PCT",
            "AXIORA_AXION_OUTCOME_DRIFT_WARN_PCT",
        ),
    )
    axion_feature_drift_thresholds_json: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "AXION_FEATURE_DRIFT_THRESHOLDS_JSON",
            "AXIORA_AXION_FEATURE_DRIFT_THRESHOLDS_JSON",
        ),
    )
    axion_kill_switch: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "AXION_KILL_SWITCH",
            "AXIORA_AXION_KILL_SWITCH",
        ),
    )
    axion_auto_rollback_error_rate_threshold: float = Field(
        default=5.0,
        validation_alias=AliasChoices(
            "AXION_AUTO_ROLLBACK_ERROR_RATE_THRESHOLD",
            "AXIORA_AXION_AUTO_ROLLBACK_ERROR_RATE_THRESHOLD",
        ),
    )
    axion_auto_rollback_p95_latency_threshold_ms: float = Field(
        default=250.0,
        validation_alias=AliasChoices(
            "AXION_AUTO_ROLLBACK_P95_LATENCY_THRESHOLD_MS",
            "AXIORA_AXION_AUTO_ROLLBACK_P95_LATENCY_THRESHOLD_MS",
        ),
    )
    axion_auto_rollback_drift_threshold: float = Field(
        default=0.2,
        validation_alias=AliasChoices(
            "AXION_AUTO_ROLLBACK_DRIFT_THRESHOLD",
            "AXIORA_AXION_AUTO_ROLLBACK_DRIFT_THRESHOLD",
        ),
    )
    axion_content_repeat_window_days: int = Field(
        default=7,
        validation_alias=AliasChoices(
            "AXION_CONTENT_REPEAT_WINDOW_DAYS",
            "AXIORA_AXION_CONTENT_REPEAT_WINDOW_DAYS",
        ),
    )
    axion_content_review_cooldown_hours: int = Field(
        default=24,
        validation_alias=AliasChoices(
            "AXION_CONTENT_REVIEW_COOLDOWN_HOURS",
            "AXIORA_AXION_CONTENT_REVIEW_COOLDOWN_HOURS",
        ),
    )
    axion_prerequisite_mastery_threshold: float = Field(
        default=0.6,
        validation_alias=AliasChoices(
            "AXION_PREREQUISITE_MASTERY_THRESHOLD",
            "AXIORA_AXION_PREREQUISITE_MASTERY_THRESHOLD",
        ),
    )
    axion_subject_mastery_alpha: float = Field(
        default=0.05,
        validation_alias=AliasChoices(
            "AXION_SUBJECT_MASTERY_ALPHA",
            "AXIORA_AXION_SUBJECT_MASTERY_ALPHA",
        ),
    )
    axion_subject_mastery_beta: float = Field(
        default=0.08,
        validation_alias=AliasChoices(
            "AXION_SUBJECT_MASTERY_BETA",
            "AXIORA_AXION_SUBJECT_MASTERY_BETA",
        ),
    )
    axion_safety_allowed_tags_csv: str = Field(
        default="violence_mild,violence,drugs,self_harm,sexuality,bullying",
        validation_alias=AliasChoices(
            "AXION_SAFETY_ALLOWED_TAGS_CSV",
            "AXIORA_AXION_SAFETY_ALLOWED_TAGS_CSV",
        ),
    )
    axion_safety_age_policy_json: str = Field(
        default='{"lt10":["violence","drugs","sexuality","self_harm"],"10_12":["violence","drugs","sexuality"],"13_15":["drugs","sexuality"],"16_18":[]}',
        validation_alias=AliasChoices(
            "AXION_SAFETY_AGE_POLICY_JSON",
            "AXIORA_AXION_SAFETY_AGE_POLICY_JSON",
        ),
    )
    openai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "OPENAI_API_KEY",
            "AXIORA_OPENAI_API_KEY",
        ),
    )
    axion_llm_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "AXION_LLM_ENABLED",
            "AXIORA_AXION_LLM_ENABLED",
        ),
    )
    axion_llm_timeout_seconds: float = Field(
        default=3.0,
        validation_alias=AliasChoices(
            "AXION_LLM_TIMEOUT_SECONDS",
            "AXIORA_AXION_LLM_TIMEOUT_SECONDS",
        ),
    )
    axion_llm_max_tokens: int = Field(
        default=256,
        validation_alias=AliasChoices(
            "AXION_LLM_MAX_TOKENS",
            "AXIORA_AXION_LLM_MAX_TOKENS",
        ),
    )
    axion_llm_temperature: float = Field(
        default=0.2,
        validation_alias=AliasChoices(
            "AXION_LLM_TEMPERATURE",
            "AXIORA_AXION_LLM_TEMPERATURE",
        ),
    )
    axion_llm_rate_limit_per_child_per_minute: int = Field(
        default=10,
        validation_alias=AliasChoices(
            "AXION_LLM_RATE_LIMIT_PER_CHILD_PER_MINUTE",
            "AXIORA_AXION_LLM_RATE_LIMIT_PER_CHILD_PER_MINUTE",
        ),
    )
    axion_llm_cache_ttl_seconds: int = Field(
        default=120,
        validation_alias=AliasChoices(
            "AXION_LLM_CACHE_TTL_SECONDS",
            "AXIORA_AXION_LLM_CACHE_TTL_SECONDS",
        ),
    )
    axion_llm_kill_switch: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "AXION_LLM_KILL_SWITCH",
            "AXIORA_AXION_LLM_KILL_SWITCH",
        ),
    )


settings = Settings()
