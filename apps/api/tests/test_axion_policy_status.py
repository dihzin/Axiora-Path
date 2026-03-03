from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route


def test_policy_status_returns_correct_structure(monkeypatch) -> None:
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
        "_load_child_policy_status",
        lambda *_args, **_kwargs: {
            "policy_mode": "CANARY",
            "rollout_percentage": 25,
        },
    )

    client = TestClient(app)
    response = client.get("/axion/policy_status?childId=99")
    assert response.status_code == 200
    payload = response.json()
    assert payload["policyMode"] == "CANARY"
    assert payload["rolloutPercentage"] == 25

