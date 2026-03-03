from __future__ import annotations

from types import SimpleNamespace

from app.services import axion_auto_rollback as auto_rb


class _DB:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commits = 0

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1


def _patch_common(monkeypatch, *, state: str = "ACTIVE") -> None:
    monkeypatch.setattr(auto_rb, "_resolve_tenant_id", lambda *_args, **_kwargs: 1)
    monkeypatch.setattr(auto_rb, "_resolve_actor_user_id", lambda *_args, **_kwargs: 10)
    monkeypatch.setattr(auto_rb, "get_current_policy_state", lambda *_args, **_kwargs: state)


def test_auto_rollback_triggers_on_high_error_rate(monkeypatch) -> None:
    db = _DB()
    _patch_common(monkeypatch)
    monkeypatch.setattr(
        auto_rb,
        "_load_operational_metrics",
        lambda *_args, **_kwargs: {"exposures_total": 100, "error_total": 12, "error_rate_pct": 12.0, "p95_latency_ms": 100.0},
    )
    monkeypatch.setattr(
        auto_rb,
        "evaluate_drift_status",
        lambda *_args, **_kwargs: SimpleNamespace(feature_drift_score=0.05, outcome_drift_pct=1.0),
    )
    transitions: list[dict[str, object]] = []
    monkeypatch.setattr(
        auto_rb,
        "transition_policy_state",
        lambda *_args, **kwargs: transitions.append(kwargs),
    )

    result = auto_rb.evaluate_auto_rollback(
        db,
        experiment_key="nba_retention_v1",
        error_rate_threshold=5.0,
        p95_latency_threshold_ms=500.0,
        drift_threshold=0.9,
    )
    assert result.rolled_back is True
    assert "error_rate_threshold_exceeded" in result.reasons
    assert len(transitions) == 1
    assert any(getattr(item, "type", "") == "axion_auto_rollback" for item in db.added)


def test_auto_rollback_triggers_on_high_latency(monkeypatch) -> None:
    db = _DB()
    _patch_common(monkeypatch)
    monkeypatch.setattr(
        auto_rb,
        "_load_operational_metrics",
        lambda *_args, **_kwargs: {"exposures_total": 100, "error_total": 1, "error_rate_pct": 1.0, "p95_latency_ms": 900.0},
    )
    monkeypatch.setattr(
        auto_rb,
        "evaluate_drift_status",
        lambda *_args, **_kwargs: SimpleNamespace(feature_drift_score=0.05, outcome_drift_pct=1.0),
    )
    transitions: list[dict[str, object]] = []
    monkeypatch.setattr(
        auto_rb,
        "transition_policy_state",
        lambda *_args, **kwargs: transitions.append(kwargs),
    )

    result = auto_rb.evaluate_auto_rollback(
        db,
        experiment_key="nba_retention_v1",
        error_rate_threshold=10.0,
        p95_latency_threshold_ms=250.0,
        drift_threshold=0.9,
    )
    assert result.rolled_back is True
    assert "p95_latency_threshold_exceeded" in result.reasons
    assert len(transitions) == 1


def test_auto_rollback_triggers_on_high_drift(monkeypatch) -> None:
    db = _DB()
    _patch_common(monkeypatch)
    monkeypatch.setattr(
        auto_rb,
        "_load_operational_metrics",
        lambda *_args, **_kwargs: {"exposures_total": 100, "error_total": 1, "error_rate_pct": 1.0, "p95_latency_ms": 100.0},
    )
    monkeypatch.setattr(
        auto_rb,
        "evaluate_drift_status",
        lambda *_args, **_kwargs: SimpleNamespace(feature_drift_score=0.6, outcome_drift_pct=5.0),
    )
    transitions: list[dict[str, object]] = []
    monkeypatch.setattr(
        auto_rb,
        "transition_policy_state",
        lambda *_args, **kwargs: transitions.append(kwargs),
    )

    result = auto_rb.evaluate_auto_rollback(
        db,
        experiment_key="nba_retention_v1",
        error_rate_threshold=10.0,
        p95_latency_threshold_ms=500.0,
        drift_threshold=0.2,
    )
    assert result.rolled_back is True
    assert "drift_threshold_exceeded" in result.reasons
    assert len(transitions) == 1


def test_auto_rollback_is_idempotent_when_already_rolled_back(monkeypatch) -> None:
    db = _DB()
    _patch_common(monkeypatch, state="ROLLED_BACK")
    monkeypatch.setattr(
        auto_rb,
        "_load_operational_metrics",
        lambda *_args, **_kwargs: {"exposures_total": 100, "error_total": 50, "error_rate_pct": 50.0, "p95_latency_ms": 2000.0},
    )
    monkeypatch.setattr(
        auto_rb,
        "evaluate_drift_status",
        lambda *_args, **_kwargs: SimpleNamespace(feature_drift_score=0.9, outcome_drift_pct=30.0),
    )

    called = {"transition": 0}

    def _transition(*_args, **_kwargs):
        called["transition"] += 1

    monkeypatch.setattr(auto_rb, "transition_policy_state", _transition)

    result = auto_rb.evaluate_auto_rollback(db, experiment_key="nba_retention_v1")
    assert result.rolled_back is False
    assert "already_rolled_back" in result.reasons
    assert called["transition"] == 0
