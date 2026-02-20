from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

SUPPORTED_PROVIDER_KEYS = {"noop", "openai"}


def validate_llm_provider_config() -> tuple[bool, list[str]]:
    warnings: list[str] = []
    provider = (settings.llm_provider_key or "noop").strip().lower()
    if provider not in SUPPORTED_PROVIDER_KEYS:
        warnings.append(f"Unsupported LLM provider '{provider}'. Falling back to noop.")
        return False, warnings

    if provider == "openai":
        if not settings.llm_api_key:
            warnings.append("LLM_PROVIDER_KEY=openai configured but LLM_API_KEY is missing. Falling back to noop.")
        if not settings.llm_model:
            warnings.append("LLM_PROVIDER_KEY=openai configured but LLM_MODEL is missing. Falling back to noop.")
        if warnings:
            return False, warnings

    return True, warnings


def validate_llm_provider_config_on_boot() -> None:
    valid, warnings = validate_llm_provider_config()
    for item in warnings:
        logger.warning(item)
    if valid:
        logger.info("LLM provider config validated successfully.")
    else:
        logger.warning("LLM provider disabled due to config issues. App will continue with noop provider.")


def validate_runtime_security_on_boot() -> None:
    env = (settings.app_env or "development").strip().lower()
    origins = [item.strip() for item in (settings.cors_allowed_origins or "").split(",") if item.strip()]
    same_site = (settings.auth_cookie_samesite or "lax").strip().lower()

    if env == "production":
        if not origins:
            raise RuntimeError("AXIORA_CORS_ALLOWED_ORIGINS must be set in production.")
        if "*" in origins:
            raise RuntimeError("Wildcard CORS origin is not allowed in production.")
        if any("localhost" in origin or "127.0.0.1" in origin for origin in origins):
            raise RuntimeError("localhost/127.0.0.1 CORS origins are not allowed in production.")
        if same_site not in {"none", "lax", "strict"}:
            raise RuntimeError("AXIORA_AUTH_COOKIE_SAMESITE must be one of: none, lax, strict.")
        if same_site == "none" and not settings.auth_cookie_secure:
            raise RuntimeError("AXIORA_AUTH_COOKIE_SECURE must be true when AXIORA_AUTH_COOKIE_SAMESITE=none.")

    if env != "production":
        if same_site not in {"none", "lax", "strict"}:
            logger.warning("Invalid AXIORA_AUTH_COOKIE_SAMESITE value. Expected none/lax/strict.")
