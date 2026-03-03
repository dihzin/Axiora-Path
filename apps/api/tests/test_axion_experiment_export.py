from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route


def test_nba_export_endpoint_streams_csv(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    app.dependency_overrides[deps.get_db] = lambda: SimpleNamespace()
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=42)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=5, email="tester@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="CHILD"))

    captured: dict[str, object] = {}

    def _fake_stream(
        _db: object,
        *,
        tenant_id: int,
        date_from: object = None,
        date_to: object = None,
    ):
        captured["tenant_id"] = tenant_id
        captured["date_from"] = date_from
        captured["date_to"] = date_to
        yield "user_id,child_id,variant,first_exposure_at,session_started,session_completed,retained_d1,retained_d7,sessions_30d\n"
        yield "1,100,CONTROL,2026-02-26T00:00:00+00:00,true,true,true,true,4\n"

    monkeypatch.setattr(axion_route, "stream_nba_retention_export_csv", _fake_stream)

    client = TestClient(app)
    response = client.get(
        "/api/axion/experiment/nba_retention_v1/export",
        params={"dateFrom": "2026-02-01", "dateTo": "2026-02-20"},
    )

    assert response.status_code == 200
    assert "text/csv" in response.headers.get("content-type", "")
    assert "attachment; filename=" in response.headers.get("content-disposition", "")
    assert "user_id,child_id,variant,first_exposure_at,session_started,session_completed,retained_d1,retained_d7,sessions_30d" in response.text
    assert "1,100,CONTROL" in response.text
    assert captured["tenant_id"] == 42
