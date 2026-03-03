from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route


def test_guardrails_summary_returns_correct_structure(monkeypatch) -> None:
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
        "_load_guardrails_summary",
        lambda *_args, **_kwargs: {
            "repeats_blocked_last_7_days": 5,
            "safety_blocks_last_7_days": 3,
            "fallback_activations_last_7_days": 7,
        },
    )

    client = TestClient(app)
    response = client.get("/axion/guardrails_summary?childId=99")
    assert response.status_code == 200
    payload = response.json()
    assert payload["repeats_blocked_last_7_days"] == 5
    assert payload["safety_blocks_last_7_days"] == 3
    assert payload["fallback_activations_last_7_days"] == 7

