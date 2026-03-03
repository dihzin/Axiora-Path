from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route
from app.services import axion_session_delta


def test_session_delta_returns_correct_difference(monkeypatch) -> None:
    decision = SimpleNamespace(
        decided_at=datetime.now(UTC),
        metadata_json={"selected_content_id": 123},
    )
    monkeypatch.setattr(axion_session_delta, "_load_last_decision", lambda *_args, **_kwargs: decision)
    monkeypatch.setattr(axion_session_delta, "_resolve_decision_subject", lambda *_args, **_kwargs: "math")
    monkeypatch.setattr(axion_session_delta, "_load_baseline_mastery_before_decision", lambda *_args, **_kwargs: 0.52)
    monkeypatch.setattr(axion_session_delta, "_load_current_mastery", lambda *_args, **_kwargs: 0.55)

    payload = axion_session_delta.get_session_delta(
        db=object(),  # type: ignore[arg-type]
        tenant_id=1,
        child_id=99,
        user_id=10,
    )
    assert payload["subject"] == "math"
    assert payload["delta_mastery"] == 0.03


def test_session_delta_endpoint_returns_structure(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=1)

    def _user(request: Request):
        request.state.auth_role = "CHILD"
        return SimpleNamespace(id=10, email="child@local.com")

    app.dependency_overrides[deps.get_current_user] = _user
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="CHILD"))

    monkeypatch.setattr(axion_route, "_resolve_child_for_brief", lambda *_args, **_kwargs: 99)
    monkeypatch.setattr(
        axion_route,
        "get_session_delta",
        lambda *_args, **_kwargs: {"subject": "math", "delta_mastery": 0.03},
    )

    client = TestClient(app)
    response = client.get("/axion/session_delta?childId=99")
    assert response.status_code == 200
    assert response.json() == {"subject": "math", "delta_mastery": 0.03}
