from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route


def test_recent_unlocks_returns_correct_structure(monkeypatch) -> None:
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
        "_load_recent_prereq_unlocks",
        lambda *_args, **_kwargs: [
            {
                "content_id": 123,
                "subject": "math",
                "unlocked_at": datetime(2026, 2, 26, 12, 0, tzinfo=UTC),
                "reason": "prerequisite_completed",
            }
        ],
    )

    client = TestClient(app)
    response = client.get("/axion/recent_unlocks?childId=99")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert len(payload) == 1
    assert payload[0]["contentId"] == 123
    assert payload[0]["subject"] == "math"
    assert "unlockedAt" in payload[0]
    assert payload[0]["reason"] == "prerequisite_completed"

