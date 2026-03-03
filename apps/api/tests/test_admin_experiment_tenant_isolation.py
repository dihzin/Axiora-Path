from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route


def _build_app(*, tenant_id: int | None, admin: bool = True, super_admin: bool = False) -> TestClient:
    app = FastAPI()
    app.include_router(axion_route.router)
    app.dependency_overrides[deps.get_db] = lambda: SimpleNamespace()
    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: (SimpleNamespace(id=tenant_id) if tenant_id is not None else None)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=9, email="admin@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="TEACHER"))
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=tenant_id or 1)
    axion_route.settings.platform_super_admin_emails = "super@example.com" if super_admin else ""
    axion_route.settings.platform_admin_emails = "admin@example.com,super@example.com"
    if super_admin:
        app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=10, email="super@example.com")
    if not admin:
        app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=11, email="viewer@example.com")
    return TestClient(app)


def test_admin_experiments_access_is_tenant_isolated(monkeypatch) -> None:
    client = _build_app(tenant_id=1, admin=True)
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)

    response = client.get("/admin/experiments/access")
    assert response.status_code == 200
    payload = response.json()
    assert payload["tenantId"] == 1
    assert payload["tenantId"] != 2


def test_admin_experiment_dashboard_is_tenant_isolated(monkeypatch) -> None:
    client = _build_app(tenant_id=1, admin=True)
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)

    def _fake_dashboard(_db, *, tenant_id: int, **_kwargs):
        if tenant_id == 1:
            return {
                "exposuresTotal": 10,
                "uniqueExposuresPerDay": 8,
                "ctaClicked": 5,
                "sessionStarted": 3,
                "ctaToSessionStartedPct": 60.0,
                "d1RatePct": 30.0,
                "d7RatePct": 10.0,
                "avgSessionFrequency30d": 1.5,
                "variants": [],
            }
        return {
            "exposuresTotal": 999,
            "uniqueExposuresPerDay": 999,
            "ctaClicked": 999,
            "sessionStarted": 999,
            "ctaToSessionStartedPct": 0.0,
            "d1RatePct": 0.0,
            "d7RatePct": 0.0,
            "avgSessionFrequency30d": 0.0,
            "variants": [],
        }

    monkeypatch.setattr(axion_route, "_build_experiment_dashboard_response", _fake_dashboard)
    response = client.get("/admin/experiments/nba_retention_v1/dashboard")
    assert response.status_code == 200
    payload = response.json()
    assert payload["exposuresTotal"] == 10
    assert payload["exposuresTotal"] != 999


def test_admin_experiment_retention_is_tenant_isolated(monkeypatch) -> None:
    client = _build_app(tenant_id=1, admin=True)
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)

    def _fake_compute(_db, *, tenant_id: int, **_kwargs):
        if tenant_id == 1:
            return {
                "experiment_key": "nba_retention_v1",
                "experiment_status": "ACTIVE",
                "cohort_users": 20,
                "retained_d1_users": 6,
                "retained_d7_users": 4,
                "d1_rate": 30.0,
                "d7_rate": 20.0,
                "variants": [],
            }
        return {
            "experiment_key": "nba_retention_v1",
            "experiment_status": "ACTIVE",
            "cohort_users": 999,
            "retained_d1_users": 999,
            "retained_d7_users": 999,
            "d1_rate": 0.0,
            "d7_rate": 0.0,
            "variants": [],
        }

    monkeypatch.setattr(axion_route, "compute_retention_metrics", _fake_compute)
    response = client.get("/admin/experiments/nba_retention_v1/retention")
    assert response.status_code == 200
    payload = response.json()
    assert payload["cohortUsers"] == 20
    assert payload["cohortUsers"] != 999


def test_admin_experiment_retention_metrics_is_tenant_isolated(monkeypatch) -> None:
    client = _build_app(tenant_id=1, admin=True)
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)

    def _fake_retention(_db, *, target_tenant_id: int, **_kwargs):
        if target_tenant_id == 1:
            return {
                "cohortUsers": 15,
                "retainedD1Users": 5,
                "retainedD7Users": 3,
                "retainedD30Users": 0,
                "d1Rate": 33.33,
                "d7Rate": 20.0,
                "d30Rate": 0.0,
                "sessionFrequency": 1.1,
                "ctaClickUsers": 5,
                "sessionStartedUsers": 4,
                "ctaSessionStartedConvertedUsers": 3,
                "ctaToSessionStartedConversion": 60.0,
                "ctaSessionConvertedUsers": 2,
                "ctaToSessionConversion": 40.0,
                "exposuresTotal": 9,
                "uniqueExposuresPerDay": 8,
                "lookbackDays": 30,
                "filters": {"tenantId": 1},
            }
        return {
            "cohortUsers": 999,
            "retainedD1Users": 999,
            "retainedD7Users": 999,
            "retainedD30Users": 0,
            "d1Rate": 0.0,
            "d7Rate": 0.0,
            "d30Rate": 0.0,
            "sessionFrequency": 0.0,
            "ctaClickUsers": 0,
            "sessionStartedUsers": 0,
            "ctaSessionStartedConvertedUsers": 0,
            "ctaToSessionStartedConversion": 0.0,
            "ctaSessionConvertedUsers": 0,
            "ctaToSessionConversion": 0.0,
            "exposuresTotal": 999,
            "uniqueExposuresPerDay": 999,
            "lookbackDays": 30,
            "filters": {"tenantId": 2},
        }

    monkeypatch.setattr(axion_route, "_build_axion_retention_metrics_response", _fake_retention)
    response = client.get("/admin/experiments/nba_retention_v1/retention_metrics")
    assert response.status_code == 200
    payload = response.json()
    assert payload["cohortUsers"] == 15
    assert payload["cohortUsers"] != 999


def test_admin_experiment_endpoints_are_tenant_isolated(monkeypatch) -> None:
    log_calls: list[dict[str, object]] = []
    client = _build_app(tenant_id=1, admin=True)
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)

    def _capture(_message: str, *, extra: dict[str, object] | None = None, **_kwargs) -> None:
        if extra is not None:
            log_calls.append(extra)

    monkeypatch.setattr(axion_route.logger, "info", _capture)
    monkeypatch.setattr(
        axion_route,
        "_build_experiment_dashboard_response",
        lambda *_args, **_kwargs: {
            "exposuresTotal": 1,
            "uniqueExposuresPerDay": 1,
            "ctaClicked": 1,
            "sessionStarted": 1,
            "ctaToSessionStartedPct": 100.0,
            "d1RatePct": 100.0,
            "d7RatePct": 100.0,
            "avgSessionFrequency30d": 1.0,
            "variants": [],
        },
    )
    monkeypatch.setattr(
        axion_route,
        "compute_retention_metrics",
        lambda *_args, **_kwargs: {
            "experiment_key": "nba_retention_v1",
            "experiment_status": "ACTIVE",
            "cohort_users": 1,
            "retained_d1_users": 1,
            "retained_d7_users": 1,
            "d1_rate": 100.0,
            "d7_rate": 100.0,
            "variants": [],
        },
    )
    monkeypatch.setattr(
        axion_route,
        "_build_axion_retention_metrics_response",
        lambda *_args, **_kwargs: {
            "cohortUsers": 1,
            "retainedD1Users": 1,
            "retainedD7Users": 1,
            "retainedD30Users": 0,
            "d1Rate": 100.0,
            "d7Rate": 100.0,
            "d30Rate": 0.0,
            "sessionFrequency": 1.0,
            "ctaClickUsers": 1,
            "sessionStartedUsers": 1,
            "ctaSessionStartedConvertedUsers": 1,
            "ctaToSessionStartedConversion": 100.0,
            "ctaSessionConvertedUsers": 1,
            "ctaToSessionConversion": 100.0,
            "exposuresTotal": 1,
            "uniqueExposuresPerDay": 1,
            "lookbackDays": 30,
            "filters": {"tenantId": 1},
        },
    )

    assert client.get("/admin/experiments/access").status_code == 200
    assert client.get("/admin/experiments/nba_retention_v1/dashboard").status_code == 200
    assert client.get("/admin/experiments/nba_retention_v1/retention").status_code == 200
    assert client.get("/admin/experiments/nba_retention_v1/retention_metrics").status_code == 200

    filter_logs = [row for row in log_calls if row.get("admin_endpoint_tenant_filter_applied") is True]
    assert len(filter_logs) >= 4


def test_admin_endpoint_missing_tenant_returns_403_unless_super_admin(monkeypatch) -> None:
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)

    non_super = _build_app(tenant_id=None, admin=True, super_admin=False)
    denied = non_super.get("/admin/experiments/access")
    assert denied.status_code == 403

    super_admin = _build_app(tenant_id=None, admin=True, super_admin=True)
    allowed = super_admin.get("/admin/experiments/access", params={"targetTenantId": 2})
    assert allowed.status_code == 200
    assert allowed.json()["tenantId"] == 2
