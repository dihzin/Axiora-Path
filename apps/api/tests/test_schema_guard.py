from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route
from app.services import schema_guard
from app.services.schema_guard import SchemaStatus


def test_schema_guard_fails_in_production_when_out_of_sync(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(schema_guard, "_load_schema_revisions", lambda: ("0068_old", "0084_head"))
    with pytest.raises(SystemExit) as exc:
        schema_guard.enforce_schema_sync_on_startup(app_env="production")
    assert int(exc.value.code or 0) == 1


def test_schema_guard_warns_in_dev(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setattr(schema_guard, "_load_schema_revisions", lambda: ("0068_old", "0084_head"))
    with caplog.at_level("WARNING"):
        result = schema_guard.enforce_schema_sync_on_startup(app_env="development")
    assert result.in_sync is False
    assert result.status == "WARN"
    assert "schema_guard_out_of_sync_dev" in caplog.text


def test_schema_status_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
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
        "get_schema_status",
        lambda: SchemaStatus(
            current_revision="0083_axion_decisions_correlation_id",
            head_revision="0084_axion_decision_policy_invariants",
            in_sync=False,
            status="WARN",
        ),
    )

    client = TestClient(app)
    response = client.get("/admin/axion/schema_status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["current_revision"] == "0083_axion_decisions_correlation_id"
    assert payload["head_revision"] == "0084_axion_decision_policy_invariants"
    assert payload["in_sync"] is False
    assert payload["status"] == "WARN"

