from __future__ import annotations

import pytest

from app.observability import axion_metrics
from app.services.axion_coach_llm import build_coach_prompt, generate_axion_coach_message
from app.services import axion_coach_llm


def test_llm_disabled_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "axion_llm_enabled", False)
    monkeypatch.setattr(settings, "openai_api_key", "fake-key")

    result = generate_axion_coach_message(
        system_prompt="coach",
        user_payload={"text": "hello"},
    )

    assert result is None


def test_llm_kill_switch_blocks_generation(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    original_backend = axion_metrics._METRICS_BACKEND
    axion_metrics._METRICS_BACKEND = axion_metrics._InMemoryAxionMetrics()
    axion_coach_llm._reset_llm_runtime_state_for_tests()
    try:
        monkeypatch.setattr(settings, "axion_llm_kill_switch", True)
        monkeypatch.setattr(settings, "axion_llm_enabled", True)
        monkeypatch.setattr(settings, "openai_api_key", "fake-key")

        calls: list[int] = []
        monkeypatch.setattr(
            axion_coach_llm,
            "_request_openai_chat",
            lambda **_kwargs: (calls.append(1) or "should-not-run"),
        )

        result = generate_axion_coach_message(
            system_prompt="coach",
            user_payload={"text": "hello"},
            child_id=777,
            content_id=10,
            outcome="correct",
        )
        health = axion_metrics.get_axion_metrics_health()
        assert result is None
        assert calls == []
        assert int(health.get("llm_kill_switch_triggered_total", 0)) >= 1
    finally:
        axion_metrics._METRICS_BACKEND = original_backend


def test_llm_rate_limit_enforced(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    axion_coach_llm._reset_llm_runtime_state_for_tests()
    monkeypatch.setattr(settings, "axion_llm_enabled", True)
    monkeypatch.setattr(settings, "openai_api_key", "fake-key")
    monkeypatch.setattr(settings, "axion_llm_rate_limit_per_child_per_minute", 1)
    monkeypatch.setattr(settings, "axion_llm_cache_ttl_seconds", 0)

    calls: list[int] = []
    monkeypatch.setattr(
        axion_coach_llm,
        "_request_openai_chat",
        lambda **_kwargs: (calls.append(1) or "coach-message"),
    )

    first = generate_axion_coach_message(
        system_prompt="coach",
        user_payload={"text": "hello"},
        child_id=101,
        content_id=10,
        outcome="incorrect",
    )
    second = generate_axion_coach_message(
        system_prompt="coach",
        user_payload={"text": "hello2"},
        child_id=101,
        content_id=11,
        outcome="incorrect",
    )

    assert first == "coach-message"
    assert second is None
    assert len(calls) == 1


def test_llm_cache_hit(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    original_backend = axion_metrics._METRICS_BACKEND
    axion_metrics._METRICS_BACKEND = axion_metrics._InMemoryAxionMetrics()
    axion_coach_llm._reset_llm_runtime_state_for_tests()
    try:
        monkeypatch.setattr(settings, "axion_llm_enabled", True)
        monkeypatch.setattr(settings, "openai_api_key", "fake-key")
        monkeypatch.setattr(settings, "axion_llm_rate_limit_per_child_per_minute", 10)
        monkeypatch.setattr(settings, "axion_llm_cache_ttl_seconds", 120)

        calls: list[int] = []
        monkeypatch.setattr(
            axion_coach_llm,
            "_request_openai_chat",
            lambda **_kwargs: (calls.append(1) or "cached-coach-message"),
        )

        first = generate_axion_coach_message(
            system_prompt="coach",
            user_payload={"text": "hello"},
            child_id=202,
            content_id=99,
            outcome="correct",
        )
        second = generate_axion_coach_message(
            system_prompt="coach",
            user_payload={"text": "hello changed"},
            child_id=202,
            content_id=99,
            outcome="correct",
        )

        health = axion_metrics.get_axion_metrics_health()
        assert first == "cached-coach-message"
        assert second == "cached-coach-message"
        assert len(calls) == 1
        assert int(health["llm_cache_hit_total"]) >= 1
    finally:
        axion_metrics._METRICS_BACKEND = original_backend


def test_prompt_template_varies_by_age() -> None:
    young = build_coach_prompt(
        child_age=8,
        subject="matematica",
        difficulty=3,
        outcome="incorrect",
    )
    older = build_coach_prompt(
        child_age=14,
        subject="matematica",
        difficulty=3,
        outcome="incorrect",
    )
    assert young is not None
    assert older is not None
    assert "frases bem curtas" in young.lower()
    assert "linguagem objetiva e encorajadora" in older.lower()
    assert young != older


def test_prompt_never_includes_forbidden_tokens() -> None:
    prompt = build_coach_prompt(
        child_age=12,
        subject="math policy tenant rollout",
        difficulty=5,
        outcome="canary bandit experimento interno",
    )
    assert prompt is not None
    lowered = prompt.lower()
    assert "policy" not in lowered
    assert "tenant" not in lowered
    assert "rollout" not in lowered
    assert "bandit" not in lowered
    assert "canary" not in lowered
    assert "experimento interno" not in lowered


def test_prompt_blocks_sensitive_safety_tags_by_age(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(
        settings,
        "axion_safety_age_policy_json",
        '{"lt10":["violence","drugs","sexuality","self_harm"],"10_12":["violence"],"13_15":[],"16_18":[]}',
    )
    prompt = build_coach_prompt(
        child_age=9,
        subject="matematica",
        difficulty=2,
        outcome="incorrect",
        safety_tags=["violence"],
    )
    assert prompt is None
