from __future__ import annotations

from app.services import axion_feature_vector as fv


def test_feature_vector_has_expected_shape(monkeypatch) -> None:
    monkeypatch.setattr(fv, "_resolve_feature_version", lambda _db: 3)
    monkeypatch.setattr(fv, "_resolve_tenant_id", lambda _db, *, user_id: 10)
    monkeypatch.setattr(fv, "_resolve_age_bucket", lambda _db, *, user_id, experiment_key: "9_12")
    monkeypatch.setattr(fv, "_resolve_plan_type", lambda _db, *, tenant_id: "PRO")
    monkeypatch.setattr(fv, "_resolve_streak_length", lambda _db, *, user_id: 6)
    monkeypatch.setattr(fv, "_resolve_last_session_gap_days", lambda _db, *, user_id: 2)
    monkeypatch.setattr(fv, "_resolve_historical_completion_rate", lambda _db, *, user_id: 0.75)
    monkeypatch.setattr(fv, "_resolve_historical_retention_rate", lambda _db, *, user_id: 0.4)

    result = fv.build_feature_vector(object(), user_id=42, experiment_key="nba_retention_v1")

    assert result["feature_version"] == 3
    assert result["feature_order"] == [
        "age_bucket",
        "plan_type",
        "streak_length",
        "last_session_gap",
        "historical_completion_rate",
        "historical_retention_rate",
    ]
    assert result["feature_values"] == ["9_12", "PRO", 6, 2, 0.75, 0.4]
    assert result["features"]["age_bucket"] == "9_12"
    assert result["features"]["plan_type"] == "PRO"
    assert result["metadata"]["user_id"] == 42
    assert result["metadata"]["experiment_key"] == "nba_retention_v1"


def test_feature_vector_version_matches_registry(monkeypatch) -> None:
    class _FakeRegistryDB:
        def scalar(self, *_args, **_kwargs):
            return 7

    monkeypatch.setattr(fv, "_resolve_tenant_id", lambda _db, *, user_id: 1)
    monkeypatch.setattr(fv, "_resolve_age_bucket", lambda _db, *, user_id, experiment_key: "13_plus")
    monkeypatch.setattr(fv, "_resolve_plan_type", lambda _db, *, tenant_id: "PREMIUM")
    monkeypatch.setattr(fv, "_resolve_streak_length", lambda _db, *, user_id: 8)
    monkeypatch.setattr(fv, "_resolve_last_session_gap_days", lambda _db, *, user_id: 1)
    monkeypatch.setattr(fv, "_resolve_historical_completion_rate", lambda _db, *, user_id: 0.8)
    monkeypatch.setattr(fv, "_resolve_historical_retention_rate", lambda _db, *, user_id: 0.5)

    result = fv.build_feature_vector(_FakeRegistryDB(), user_id=9, experiment_key="nba_retention_v1")

    assert result["feature_version"] == 7

