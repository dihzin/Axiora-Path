from __future__ import annotations

from typing import Any, Protocol

from app.core.config import settings
from app.services.providers.noop import NoopLLMProvider
from app.services.providers.openai_provider import OpenAIProvider


class LLMProvider(Protocol):
    def rewriteMessage(self, input: dict[str, Any]) -> str | None: ...

    def explainMistake(self, input: dict[str, Any]) -> str | None: ...

    def generateVariants(self, input: dict[str, Any]) -> list[dict[str, Any]] | None: ...

    def parentInsight(self, input: dict[str, Any]) -> str | None: ...


def get_llm_provider(provider_key: str | None) -> LLMProvider:
    normalized = (provider_key or settings.llm_provider_key or "noop").strip().lower()
    if normalized == "openai":
        if not settings.llm_api_key or not settings.llm_model:
            return NoopLLMProvider(reason="openai_misconfigured")
        return OpenAIProvider(api_key=settings.llm_api_key, model=settings.llm_model)
    return NoopLLMProvider()

