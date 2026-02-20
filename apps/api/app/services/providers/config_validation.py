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

