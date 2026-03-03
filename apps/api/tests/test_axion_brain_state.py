from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route
from app.services.axion_brain_state import get_child_brain_state


def test_brain_state_returns_correct_structure(monkeypatch) -> None:
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
        "get_child_brain_state",
        lambda *_args, **_kwargs: {
            "subjects": [
                {
                    "subject": "math",
                    "mastery_score": 0.72,
                    "trend_last_7_days": 0.08,
                    "status": "improving",
                }
            ],
            "weakest_subject": "math",
            "strongest_subject": "math",
            "average_mastery": 0.72,
        },
    )

    client = TestClient(app)
    response = client.get("/axion/brain_state?childId=99")
    assert response.status_code == 200
    payload = response.json()
    assert "subjects" in payload
    assert isinstance(payload["subjects"], list)
    assert payload["subjects"][0]["subject"] == "math"
    assert payload["subjects"][0]["masteryScore"] == 0.72
    assert payload["subjects"][0]["trendLast7Days"] == 0.08
    assert payload["subjects"][0]["status"] == "improving"
    assert payload["weakestSubject"] == "math"
    assert payload["strongestSubject"] == "math"
    assert payload["averageMastery"] == 0.72


class _FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class _FakeMappingsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class _FakeExecuteResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return _FakeMappingsResult(self._rows)


class _BrainStateSpyDB:
    def __init__(self) -> None:
        self.scalars_calls = 0
        self.execute_calls = 0
        self._mastery_rows = [
            SimpleNamespace(subject="math", mastery_score=0.45),
            SimpleNamespace(subject="portuguese", mastery_score=0.62),
            SimpleNamespace(subject="science", mastery_score=0.81),
        ]
        self._trend_rows = [
            {"subject": "math", "trend_last_7_days": 0.03},
            {"subject": "portuguese", "trend_last_7_days": -0.01},
            {"subject": "science", "trend_last_7_days": 0.0},
        ]

    def scalars(self, *_args, **_kwargs):
        self.scalars_calls += 1
        return _FakeScalarResult(self._mastery_rows)

    def execute(self, *_args, **_kwargs):
        self.execute_calls += 1
        return _FakeExecuteResult(self._trend_rows)


def test_brain_state_executes_single_query_per_child() -> None:
    db = _BrainStateSpyDB()
    payload = get_child_brain_state(
        db,  # type: ignore[arg-type]
        tenant_id=1,
        child_id=99,
    )
    assert isinstance(payload["subjects"], list)
    assert len(payload["subjects"]) == 3
    assert db.scalars_calls == 1
    assert db.execute_calls == 1
