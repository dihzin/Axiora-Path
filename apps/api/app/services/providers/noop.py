from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class NoopLLMProvider:
    key: str = "noop"
    reason: str | None = None

    def rewriteMessage(self, input: dict[str, Any]) -> str | None:
        _ = input
        return None

    def explainMistake(self, input: dict[str, Any]) -> str | None:
        _ = input
        return None

    def generateVariants(self, input: dict[str, Any]) -> list[dict[str, Any]] | None:
        _ = input
        return None

    def parentInsight(self, input: dict[str, Any]) -> str | None:
        _ = input
        return None

