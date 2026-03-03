from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route
from app.observability import axion_metrics
from app.services import axion_mode


def test_axion_metrics_snapshot_records_counters() -> None:
    original_backend = axion_metrics._METRICS_BACKEND
    axion_metrics._METRICS_BACKEND = axion_metrics._InMemoryAxionMetrics()
    try:
        axion_metrics.safe_increment_decisions_total("CANARY")
        axion_metrics.safe_increment_errors_total("RuntimeError")
        axion_metrics.safe_increment_policy_serving_total(12)
        axion_metrics.safe_observe_latency_seconds(0.123)

        health = axion_metrics.get_axion_metrics_health()
        assert health["ready"] is True
        assert int(health["decisions_total"]) == 1
        assert int(health["errors_total"]) == 1
        assert int(health["policy_serving_total"]) == 1
        assert int(health["latency_observations"]) == 1
    finally:
        axion_metrics._METRICS_BACKEND = original_backend


def test_resolve_nba_mode_records_error_metric(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        pass

    captured_types: list[str] = []
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    monkeypatch.setattr(axion_mode, "safe_increment_errors_total", lambda error_type: captured_types.append(error_type))
    monkeypatch.setattr(axion_mode, "safe_observe_latency_seconds", lambda _seconds: None)

    with pytest.raises(RuntimeError):
        axion_mode.resolve_nba_mode(_DB(), tenant_id=1, child_id=2, user_id=3, context="child_tab")
    assert captured_types == ["RuntimeError"]


def test_metrics_health_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: SimpleNamespace(id=1)

    def _admin_user(request: Request):
        request.state.auth_role = "PLATFORM_ADMIN"
        return SimpleNamespace(id=1, email="admin@example.com")

    app.dependency_overrides[deps.get_current_user] = _admin_user
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="PLATFORM_ADMIN"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)
    monkeypatch.setattr(
        axion_route,
        "get_axion_metrics_health",
        lambda: {
            "ready": True,
            "decisions_total": 5,
            "errors_total": 1,
            "latency_observations": 5,
            "latency_sum_seconds": 0.9,
            "policy_serving_total": 2,
            "decision_modes": {"CANARY": 2, "SHADOW": 3},
            "error_types": {"RuntimeError": 1},
            "policy_versions": {"7": 2},
            "latency_buckets": {"0.25": 5},
        },
    )

    client = TestClient(app)
    response = client.get("/admin/axion/metrics_health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ready"] is True
    assert payload["decisionsTotal"] == 5
    assert payload["errorsTotal"] == 1
    assert payload["decisionModes"]["CANARY"] == 2


def test_mastery_metrics_health_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: SimpleNamespace(id=1)

    def _admin_user(request: Request):
        request.state.auth_role = "PLATFORM_ADMIN"
        return SimpleNamespace(id=1, email="admin@example.com")

    app.dependency_overrides[deps.get_current_user] = _admin_user
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="PLATFORM_ADMIN"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)
    monkeypatch.setattr(
        axion_route,
        "get_axion_mastery_metrics_health",
        lambda: {
            "ready": True,
            "mastery_updates_total": 3,
            "mastery_updates_by_subject": {"math": 2, "portuguese": 1},
            "mastery_score_histogram": {"math": {"0.5": 2}, "portuguese": {"0.4": 1}},
            "prereq_unlock_total": 1,
        },
    )

    client = TestClient(app)
    response = client.get("/admin/axion/mastery_metrics_health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ready"] is True
    assert payload["masteryUpdatesTotal"] == 3
    assert payload["masteryUpdatesBySubject"]["math"] == 2
    assert payload["prereqUnlockTotal"] == 1
