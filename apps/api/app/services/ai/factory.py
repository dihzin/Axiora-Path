from __future__ import annotations

from app.services.ai.adapters import CoachAdapter, RuleBasedCoachAdapter


def get_coach_adapter(provider: str = "rule_based") -> CoachAdapter:
    if provider == "rule_based":
        return RuleBasedCoachAdapter()

    # Placeholder for future external LLM providers.
    raise ValueError(f"Unsupported coach provider: {provider}")

