from __future__ import annotations

from app.services import axion_drift


def test_feature_drift_detected(monkeypatch) -> None:
    monkeypatch.setattr(axion_drift, "_load_outcome_means", lambda *_args, **_kwargs: (100.0, 100.0))
    monkeypatch.setattr(axion_drift, "_load_feature_payloads", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(axion_drift.settings, "axion_feature_drift_warn_threshold", 0.2)
    monkeypatch.setattr(axion_drift.settings, "axion_outcome_drift_warn_pct", 20.0)

    # Repatch with explicit toggling through call counter.
    calls = {"n": 0}

    def _feature_loader(*_args, **_kwargs):
        calls["n"] += 1
        return (["A"] * 200) if calls["n"] == 1 else (["B"] * 200)

    monkeypatch.setattr(axion_drift, "_load_feature_signatures", _feature_loader)

    result = axion_drift.evaluate_drift_status(object(), tenant_id=1, experiment_key="nba_retention_v1")
    assert result.feature_drift_score > 0.2
    assert result.status in {"WARN", "CRITICAL"}


def test_outcome_drift_detected(monkeypatch) -> None:
    monkeypatch.setattr(axion_drift, "_load_feature_signatures", lambda *_args, **_kwargs: ["A"] * 100)
    monkeypatch.setattr(axion_drift, "_load_feature_payloads", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(axion_drift, "_load_outcome_means", lambda *_args, **_kwargs: (100.0, 60.0))
    monkeypatch.setattr(axion_drift.settings, "axion_feature_drift_warn_threshold", 0.2)
    monkeypatch.setattr(axion_drift.settings, "axion_outcome_drift_warn_pct", 20.0)

    result = axion_drift.evaluate_drift_status(object(), tenant_id=1, experiment_key="nba_retention_v1")
    assert result.outcome_drift_pct == 40.0
    assert result.status in {"WARN", "CRITICAL"}


def test_per_feature_drift_reports_top_features(monkeypatch) -> None:
    baseline = [
        {"age_bucket": "9_12", "plan_type": "PRO", "streak_length": 2},
        {"age_bucket": "9_12", "plan_type": "PRO", "streak_length": 3},
        {"age_bucket": "9_12", "plan_type": "PRO", "streak_length": 2},
    ]
    recent = [
        {"age_bucket": "13_plus", "plan_type": "PRO", "streak_length": 2},
        {"age_bucket": "13_plus", "plan_type": "PRO", "streak_length": 2},
        {"age_bucket": "13_plus", "plan_type": "PRO", "streak_length": 3},
    ]
    calls = {"n": 0}

    def _payloads(*_args, **_kwargs):
        calls["n"] += 1
        return baseline if calls["n"] == 1 else recent

    monkeypatch.setattr(axion_drift, "_load_feature_signatures", lambda *_args, **_kwargs: ["S"] * 10)
    monkeypatch.setattr(axion_drift, "_load_feature_payloads", _payloads)
    monkeypatch.setattr(axion_drift, "_load_outcome_means", lambda *_args, **_kwargs: (100.0, 100.0))
    monkeypatch.setattr(axion_drift.settings, "axion_feature_drift_warn_threshold", 0.2)
    monkeypatch.setattr(axion_drift.settings, "axion_feature_drift_thresholds_json", None)

    result = axion_drift.evaluate_drift_status(object(), tenant_id=1, experiment_key="nba_retention_v1")
    assert len(result.per_feature_drift) >= 3
    assert len(result.top_drifting_features) > 0
    top_name = result.top_drifting_features[0]["feature_name"]
    assert top_name == "age_bucket"


def test_feature_specific_threshold_applied(monkeypatch) -> None:
    baseline = [{"streak_length": 1}, {"streak_length": 1}, {"streak_length": 2}, {"streak_length": 2}]
    recent = [{"streak_length": 2}, {"streak_length": 2}, {"streak_length": 2}, {"streak_length": 2}]
    calls = {"n": 0}

    def _payloads(*_args, **_kwargs):
        calls["n"] += 1
        return baseline if calls["n"] == 1 else recent

    monkeypatch.setattr(axion_drift, "_load_feature_signatures", lambda *_args, **_kwargs: ["S"] * 10)
    monkeypatch.setattr(axion_drift, "_load_feature_payloads", _payloads)
    monkeypatch.setattr(axion_drift, "_load_outcome_means", lambda *_args, **_kwargs: (100.0, 100.0))
    monkeypatch.setattr(axion_drift.settings, "axion_feature_drift_warn_threshold", 0.2)
    monkeypatch.setattr(axion_drift.settings, "axion_feature_drift_thresholds_json", '{"streak_length":0.8}')

    result = axion_drift.evaluate_drift_status(object(), tenant_id=1, experiment_key="nba_retention_v1")
    streak_row = next(item for item in result.per_feature_drift if item["feature_name"] == "streak_length")
    assert streak_row["threshold"] == 0.8
    assert streak_row["status"] == "OK"
