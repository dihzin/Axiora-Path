from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route


def test_nba_consistency_check_returns_200_and_expected_shape(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    app.dependency_overrides[deps.get_db] = lambda: SimpleNamespace()
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=7)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=11, email="tester@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="CHILD"))

    captured: dict[str, object] = {}

    def _fake_consistency_check(_db: object, *, experiment_key: str, tenant_id: int, max_rows: int = 200) -> object:
        captured["experiment_key"] = experiment_key
        captured["tenant_id"] = tenant_id
        captured["max_rows"] = max_rows
        return SimpleNamespace(
            inconsistent_users_count=1,
            multi_variant_users=[
                SimpleNamespace(
                    user_id=11,
                    variants=["CONTROL", "VARIANT_A"],
                    reasons=["user_multi_variant"],
                )
            ],
            orphan_decisions=[
                SimpleNamespace(
                    decision_id="48cd3de7-a5db-41dc-bf56-0d45077decfb",
                    user_id=11,
                    child_id=101,
                    variant="VARIANT_A",
                    created_at=datetime(2026, 2, 26, 12, 0, 0, tzinfo=UTC),
                )
            ],
            valid=False,
        )

    monkeypatch.setattr(axion_route, "run_experiment_consistency_check", _fake_consistency_check)

    client = TestClient(app)
    response = client.get("/api/axion/experiment/nba_retention_v1/consistency-check")
    assert response.status_code == 200
    payload = response.json()

    assert payload["inconsistentUsersCount"] == 1
    assert isinstance(payload.get("multiVariantUsers"), list)
    assert isinstance(payload.get("orphanDecisions"), list)
    assert payload["valid"] is False

    assert payload["multiVariantUsers"][0]["userId"] == 11
    assert payload["multiVariantUsers"][0]["variants"] == ["CONTROL", "VARIANT_A"]
    assert payload["multiVariantUsers"][0]["reasons"] == ["user_multi_variant"]

    assert payload["orphanDecisions"][0]["decisionId"] == "48cd3de7-a5db-41dc-bf56-0d45077decfb"
    assert payload["orphanDecisions"][0]["userId"] == 11
    assert payload["orphanDecisions"][0]["childId"] == 101
    assert payload["orphanDecisions"][0]["variant"] == "VARIANT_A"

    assert captured["experiment_key"] == "nba_retention_v1"
    assert captured["tenant_id"] == 7
    assert captured["max_rows"] == 200
