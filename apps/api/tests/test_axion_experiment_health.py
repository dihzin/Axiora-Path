from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services import axion_experiment_health as health


class _FakeDB:
    def __init__(self) -> None:
        self.committed = False
        self._start_date = (datetime.now(UTC) - timedelta(days=21)).date()

    def commit(self) -> None:
        self.committed = True

    def scalar(self, *_args, **_kwargs):
        return self._start_date


class _FakeSummaryDB:
    def __init__(self) -> None:
        self._start_date = (datetime.now(UTC) - timedelta(days=20)).date()
        self._scalar_calls = 0

    def scalars(self, *_args, **_kwargs):
        class _Rows:
            @staticmethod
            def all() -> list[str]:
                return ["CONTROL", "VARIANT_A", "VARIANT_B"]

        return _Rows()

    def scalar(self, *_args, **_kwargs):
        self._scalar_calls += 1
        if self._scalar_calls == 1:
            return self._start_date
        return None


def test_evaluate_experiment_health_auto_pauses_on_abrupt_started_drop(monkeypatch) -> None:
    db = _FakeDB()
    state: dict[str, object] = {"deactivated": False, "audit_calls": 0, "alerts": 0}

    monkeypatch.setattr(health, "_get_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A", "VARIANT_B"])

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {"cta_to_session_started_conversion": 60.0, "exposures_total": 100}
        if variant == "VARIANT_A":
            return {"cta_to_session_started_conversion": 35.0, "exposures_total": 20}
        if variant == "VARIANT_B":
            return {"cta_to_session_started_conversion": 58.0, "exposures_total": 20}
        return {"cta_to_session_started_conversion": 50.0, "exposures_total": 140}

    monkeypatch.setattr(health, "get_axion_retention_metrics", _fake_metrics)
    monkeypatch.setattr(health, "_count_experiment_events", lambda *_args, **_kwargs: 0)
    monkeypatch.setattr(health, "_count_invalid_decisions", lambda *_args, **_kwargs: 0)
    monkeypatch.setattr(
        health,
        "_deactivate_experiment",
        lambda *_args, **_kwargs: state.__setitem__("deactivated", True) or 3,
    )
    monkeypatch.setattr(health, "_resolve_audit_context", lambda *_args, **_kwargs: (1, 1))
    monkeypatch.setattr(
        health,
        "_write_auto_pause_audit",
        lambda *_args, **_kwargs: state.__setitem__("audit_calls", int(state["audit_calls"]) + 1),
    )
    monkeypatch.setattr(
        health,
        "send_axion_operational_alert",
        lambda **_kwargs: state.__setitem__("alerts", int(state["alerts"]) + 1) or True,
    )

    result = health.evaluate_experiment_health(
        db,
        experiment_key="nba_retention_v1",
        tenant_id=1,
        actor_user_id=1,
        session_started_drop_threshold_pct=30.0,
        error_rate_threshold_pct=5.0,
        auto_commit=True,
    )

    assert result.paused is True
    assert any("session_started_drop_gt_30_pct:VARIANT_A" in reason for reason in result.reasons)
    assert state["deactivated"] is True
    assert state["audit_calls"] == 1
    assert state["alerts"] == 1
    assert db.committed is True


def test_alert_sent_on_auto_pause(monkeypatch) -> None:
    db = _FakeDB()
    state: dict[str, int] = {"alerts": 0}

    monkeypatch.setattr(health, "_get_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A"])
    monkeypatch.setattr(
        health,
        "get_axion_retention_metrics",
        lambda _db, *, filters: (
            {"cta_to_session_started_conversion": 60.0, "exposures_total": 100}
            if getattr(filters, "variant", None) == "CONTROL"
            else {"cta_to_session_started_conversion": 20.0, "exposures_total": 100}
        ),
    )
    monkeypatch.setattr(health, "_count_experiment_events", lambda *_args, **_kwargs: 0)
    monkeypatch.setattr(health, "_count_invalid_decisions", lambda *_args, **_kwargs: 0)
    monkeypatch.setattr(health, "_deactivate_experiment", lambda *_args, **_kwargs: 1)
    monkeypatch.setattr(health, "_resolve_audit_context", lambda *_args, **_kwargs: (1, 1))
    monkeypatch.setattr(health, "_write_auto_pause_audit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        health,
        "send_axion_operational_alert",
        lambda **_kwargs: state.__setitem__("alerts", state["alerts"] + 1) or True,
    )

    result = health.evaluate_experiment_health(
        db,
        experiment_key="nba_retention_v1",
        session_started_drop_threshold_pct=30.0,
        auto_commit=True,
    )

    assert result.paused is True
    assert state["alerts"] == 1


def test_evaluate_experiment_winner_marks_variant_when_significant_uplift(monkeypatch) -> None:
    db = _FakeDB()
    state: dict[str, object] = {"winner": None, "audit_calls": 0}

    monkeypatch.setattr(health, "_get_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A", "VARIANT_B"])

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 300,
                "cta_to_session_started_conversion": 30.0,
                "d7_rate": 20.0,
            }
        if variant == "VARIANT_A":
            return {
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 380,
                "cta_to_session_started_conversion": 38.0,
                "d7_rate": 21.0,
            }
        if variant == "VARIANT_B":
            return {
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 305,
                "cta_to_session_started_conversion": 30.5,
                "d7_rate": 19.5,
            }
        return {"cta_click_users": 3000, "cta_session_started_converted_users": 985, "cta_to_session_started_conversion": 32.83, "d7_rate": 20.17}

    monkeypatch.setattr(health, "get_axion_retention_metrics", _fake_metrics)
    monkeypatch.setattr(
        health,
        "_set_winner_variant",
        lambda *_args, **kwargs: state.__setitem__("winner", kwargs.get("winner_variant")) or 3,
    )
    monkeypatch.setattr(health, "_resolve_audit_context", lambda *_args, **_kwargs: (1, 1))
    monkeypatch.setattr(
        health,
        "_write_winner_audit",
        lambda *_args, **_kwargs: state.__setitem__("audit_calls", int(state["audit_calls"]) + 1),
    )

    result = health.evaluate_experiment_winner(
        db,
        experiment_key="nba_retention_v1",
        tenant_id=1,
        actor_user_id=1,
        min_days=14,
        min_sample=200,
        auto_commit=True,
    )

    assert result.eligible is True
    assert result.winner_variant == "VARIANT_A"
    assert result.reason == "winner_marked"
    assert state["winner"] == "VARIANT_A"
    assert state["audit_calls"] == 1
    assert db.committed is True


def test_generate_experiment_summary_recommends_escalar(monkeypatch) -> None:
    db = _FakeSummaryDB()

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {
                "cohort_users": 1000,
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 300,
                "d7_rate": 20.0,
            }
        if variant == "VARIANT_A":
            return {
                "cohort_users": 1000,
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 380,
                "d7_rate": 21.0,
            }
        if variant == "VARIANT_B":
            return {
                "cohort_users": 1000,
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 305,
                "d7_rate": 19.5,
            }
        return {"cohort_users": 3000}

    monkeypatch.setattr(health, "get_axion_retention_metrics", _fake_metrics)
    monkeypatch.setattr(health, "_two_proportion_pvalue", lambda *_args, **_kwargs: 0.01)

    summary = health.generate_experiment_summary(
        db,
        "nba_retention_v1",
        min_sample=200,
    )

    assert "Período:" in summary
    assert "Total usuários: 3000" in summary
    assert "Uplift principal: VARIANT_A +8.00pp" in summary
    assert "p_value=0.0100" in summary
    assert "Recomendação: escalar" in summary


def test_generate_experiment_summary_recommends_encerrar_on_significant_drop(monkeypatch) -> None:
    db = _FakeSummaryDB()

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {
                "cohort_users": 1200,
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 300,
                "d7_rate": 20.0,
            }
        if variant == "VARIANT_A":
            return {
                "cohort_users": 1200,
                "cta_click_users": 900,
                "cta_session_started_converted_users": 252,
                "d7_rate": 20.0,
            }
        if variant == "VARIANT_B":
            return {
                "cohort_users": 1200,
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 180,
                "d7_rate": 15.0,
            }
        return {"cohort_users": 2400}

    monkeypatch.setattr(health, "get_axion_retention_metrics", _fake_metrics)

    def _fake_p_value(success_a: int, total_a: int, _success_b: int, _total_b: int) -> float:
        # Force significance only for VARIANT_B (clear drop)
        if total_a == 1000 and success_a == 180:
            return 0.01
        return 0.40

    monkeypatch.setattr(health, "_two_proportion_pvalue", _fake_p_value)

    summary = health.generate_experiment_summary(
        db,
        "nba_retention_v1",
        min_sample=200,
    )

    assert "Uplift principal: VARIANT_A -2.00pp" in summary
    assert "Recomendação: encerrar" in summary


def test_auto_pause_when_negative_significant(monkeypatch) -> None:
    db = _FakeDB()
    state: dict[str, object] = {"deactivated": False, "audit_calls": 0, "sig_events": 0}

    monkeypatch.setattr(health, "_get_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A"])

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 300,
                "cta_to_session_started_conversion": 30.0,
                "d7_rate": 20.0,
            }
        if variant == "VARIANT_A":
            return {
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 180,
                "cta_to_session_started_conversion": 18.0,
                "d7_rate": 16.0,
            }
        return {
            "cta_click_users": 2000,
            "cta_session_started_converted_users": 480,
            "cta_to_session_started_conversion": 24.0,
            "d7_rate": 18.0,
        }

    monkeypatch.setattr(health, "get_axion_retention_metrics", _fake_metrics)
    monkeypatch.setattr(health, "_resolve_audit_context", lambda *_args, **_kwargs: (1, 1))
    monkeypatch.setattr(
        health,
        "_deactivate_experiment",
        lambda *_args, **_kwargs: state.__setitem__("deactivated", True) or 2,
    )
    monkeypatch.setattr(
        health,
        "_write_auto_pause_audit",
        lambda *_args, **_kwargs: state.__setitem__("audit_calls", int(state["audit_calls"]) + 1),
    )
    monkeypatch.setattr(
        health,
        "_write_stat_sig_event",
        lambda *_args, **_kwargs: state.__setitem__("sig_events", int(state["sig_events"]) + 1),
    )

    result = health.evaluate_experiment_winner(
        db,
        experiment_key="nba_retention_v1",
        tenant_id=1,
        actor_user_id=1,
        min_days=14,
        min_sample=200,
        auto_commit=True,
    )

    assert result.eligible is False
    assert result.reason == "negative_lift_guardrail"
    assert state["deactivated"] is True
    assert state["audit_calls"] == 1
    assert state["sig_events"] == 1
    assert db.committed is True


def test_rollout_progression(monkeypatch) -> None:
    db = _FakeDB()
    state: dict[str, object] = {"updated_to": None, "audit_calls": 0, "sig_events": 0}

    monkeypatch.setattr(health.settings, "auto_scale_rollout_enabled", True)
    monkeypatch.setattr(health, "_active_experiment_variant_count", lambda *_args, **_kwargs: 2)
    monkeypatch.setattr(health, "_get_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A"])
    monkeypatch.setattr(health, "_current_rollout_percent", lambda *_args, **_kwargs: 5)
    monkeypatch.setattr(health, "_last_rollout_scaled_at", lambda *_args, **_kwargs: datetime.now(UTC) - timedelta(hours=72))
    monkeypatch.setattr(
        health,
        "_update_rollout_percent",
        lambda *_args, **kwargs: state.__setitem__("updated_to", kwargs.get("rollout_percent")) or 2,
    )
    monkeypatch.setattr(health, "_resolve_audit_context", lambda *_args, **_kwargs: (1, 1))
    monkeypatch.setattr(
        health,
        "_write_rollout_scaled_audit",
        lambda *_args, **_kwargs: state.__setitem__("audit_calls", int(state["audit_calls"]) + 1),
    )
    monkeypatch.setattr(
        health,
        "_write_stat_sig_event",
        lambda *_args, **_kwargs: state.__setitem__("sig_events", int(state["sig_events"]) + 1),
    )

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {"cta_click_users": 1000, "cta_session_started_converted_users": 300}
        if variant == "VARIANT_A":
            return {"cta_click_users": 1000, "cta_session_started_converted_users": 380}
        return {"cta_click_users": 2000, "cta_session_started_converted_users": 680}

    monkeypatch.setattr(health, "get_axion_retention_metrics", _fake_metrics)

    result = health.evaluate_rollout_progression(
        db,
        experiment_key="nba_retention_v1",
        tenant_id=1,
        actor_user_id=1,
        min_sample=200,
        min_interval_hours=48,
        auto_commit=True,
    )

    assert result.scaled is True
    assert result.previous_rollout_percent == 5
    assert result.new_rollout_percent == 10
    assert state["updated_to"] == 10
    assert state["audit_calls"] == 1
    assert state["sig_events"] == 1
    assert db.committed is True


def test_no_scale_if_not_significant(monkeypatch) -> None:
    db = _FakeDB()
    state: dict[str, object] = {"updated": False}

    monkeypatch.setattr(health.settings, "auto_scale_rollout_enabled", True)
    monkeypatch.setattr(health, "_active_experiment_variant_count", lambda *_args, **_kwargs: 2)
    monkeypatch.setattr(health, "_get_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A"])
    monkeypatch.setattr(health, "_current_rollout_percent", lambda *_args, **_kwargs: 10)
    monkeypatch.setattr(health, "_last_rollout_scaled_at", lambda *_args, **_kwargs: datetime.now(UTC) - timedelta(hours=72))
    monkeypatch.setattr(
        health,
        "_update_rollout_percent",
        lambda *_args, **_kwargs: state.__setitem__("updated", True) or 0,
    )
    monkeypatch.setattr(health, "_resolve_audit_context", lambda *_args, **_kwargs: (1, 1))
    monkeypatch.setattr(health, "_write_stat_sig_event", lambda *_args, **_kwargs: None)

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {"cta_click_users": 1000, "cta_session_started_converted_users": 300}
        if variant == "VARIANT_A":
            return {"cta_click_users": 1000, "cta_session_started_converted_users": 305}
        return {"cta_click_users": 2000, "cta_session_started_converted_users": 605}

    monkeypatch.setattr(health, "get_axion_retention_metrics", _fake_metrics)
    monkeypatch.setattr(health, "_two_proportion_pvalue", lambda *_args, **_kwargs: 0.20)

    result = health.evaluate_rollout_progression(
        db,
        experiment_key="nba_retention_v1",
        tenant_id=1,
        actor_user_id=1,
        min_sample=200,
        min_interval_hours=48,
        auto_commit=True,
    )

    assert result.scaled is False
    assert result.reason == "not_significant_positive_lift"
    assert state["updated"] is False


def test_auto_disable_canary_on_negative_lift(monkeypatch) -> None:
    db = _FakeDB()
    state: dict[str, object] = {"disabled": 0}

    monkeypatch.setattr(health, "_get_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A"])
    monkeypatch.setattr(health, "_count_experiment_events", lambda *_args, **_kwargs: 0)
    monkeypatch.setattr(health, "_count_invalid_decisions", lambda *_args, **_kwargs: 0)
    monkeypatch.setattr(health, "_two_proportion_pvalue", lambda *_args, **_kwargs: 0.01)
    monkeypatch.setattr(
        health,
        "_disable_canary_rollout",
        lambda *_args, **_kwargs: state.__setitem__("disabled", int(state["disabled"]) + 1),
    )
    monkeypatch.setattr(health, "_resolve_audit_context", lambda *_args, **_kwargs: (1, 1))

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 400,
                "cta_to_session_started_conversion": 40.0,
                "exposures_total": 1000,
            }
        if variant == "VARIANT_A":
            return {
                "cta_click_users": 1000,
                "cta_session_started_converted_users": 200,
                "cta_to_session_started_conversion": 20.0,
                "exposures_total": 1000,
            }
        return {
            "cta_click_users": 2000,
            "cta_session_started_converted_users": 600,
            "cta_to_session_started_conversion": 30.0,
            "exposures_total": 2000,
        }

    monkeypatch.setattr(health, "get_axion_retention_metrics", _fake_metrics)

    result = health.evaluate_experiment_health(
        db,
        experiment_key="nba_retention_v1",
        tenant_id=1,
        actor_user_id=1,
        session_started_drop_threshold_pct=90.0,
        auto_commit=True,
    )

    assert state["disabled"] == 1
    assert result.paused is False
    assert "canary_negative_lift_guardrail" in result.reasons


def test_rollout_does_not_increase_without_min_sample(monkeypatch) -> None:
    db = _FakeDB()
    state: dict[str, object] = {"updated": False}

    monkeypatch.setattr(health.settings, "auto_scale_rollout_enabled", True)
    monkeypatch.setattr(health.settings, "axion_min_sample_size", 1200)
    monkeypatch.setattr(health.settings, "axion_min_days_between_rollout_increase", 7)
    monkeypatch.setattr(health, "_active_experiment_variant_count", lambda *_args, **_kwargs: 2)
    monkeypatch.setattr(health, "_get_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A"])
    monkeypatch.setattr(health, "_current_rollout_percent", lambda *_args, **_kwargs: 5)
    monkeypatch.setattr(health, "_last_rollout_scaled_at", lambda *_args, **_kwargs: datetime.now(UTC) - timedelta(days=10))
    monkeypatch.setattr(
        health,
        "_update_rollout_percent",
        lambda *_args, **_kwargs: state.__setitem__("updated", True) or 0,
    )

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {"cta_click_users": 1000, "cta_session_started_converted_users": 300}
        if variant == "VARIANT_A":
            return {"cta_click_users": 1000, "cta_session_started_converted_users": 380}
        return {"cta_click_users": 2000, "cta_session_started_converted_users": 680}

    monkeypatch.setattr(health, "get_axion_retention_metrics", _fake_metrics)
    result = health.evaluate_rollout_progression(db, experiment_key="nba_retention_v1", auto_commit=True)

    assert result.scaled is False
    assert result.reason == "control_min_sample_not_reached"
    assert state["updated"] is False


def test_rollout_does_not_increase_before_min_days(monkeypatch) -> None:
    db = _FakeDB()
    state: dict[str, object] = {"updated": False}

    monkeypatch.setattr(health.settings, "auto_scale_rollout_enabled", True)
    monkeypatch.setattr(health.settings, "axion_min_sample_size", 200)
    monkeypatch.setattr(health.settings, "axion_min_days_between_rollout_increase", 7)
    monkeypatch.setattr(health, "_active_experiment_variant_count", lambda *_args, **_kwargs: 2)
    monkeypatch.setattr(health, "_get_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A"])
    monkeypatch.setattr(health, "_current_rollout_percent", lambda *_args, **_kwargs: 10)
    monkeypatch.setattr(health, "_last_rollout_scaled_at", lambda *_args, **_kwargs: datetime.now(UTC) - timedelta(days=3))
    monkeypatch.setattr(health, "_resolve_audit_context", lambda *_args, **_kwargs: (1, 1))
    monkeypatch.setattr(health, "_write_stat_sig_event", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        health,
        "_update_rollout_percent",
        lambda *_args, **_kwargs: state.__setitem__("updated", True) or 0,
    )

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {"cta_click_users": 1000, "cta_session_started_converted_users": 300}
        if variant == "VARIANT_A":
            return {"cta_click_users": 1000, "cta_session_started_converted_users": 380}
        return {"cta_click_users": 2000, "cta_session_started_converted_users": 680}

    monkeypatch.setattr(health, "get_axion_retention_metrics", _fake_metrics)
    result = health.evaluate_rollout_progression(db, experiment_key="nba_retention_v1", auto_commit=True)

    assert result.scaled is False
    assert result.reason == "min_interval_not_reached"
    assert state["updated"] is False


def test_rollout_increases_when_eligible(monkeypatch) -> None:
    db = _FakeDB()
    state: dict[str, object] = {"updated_to": None, "event_calls": 0}

    monkeypatch.setattr(health.settings, "auto_scale_rollout_enabled", True)
    monkeypatch.setattr(health.settings, "axion_min_sample_size", 200)
    monkeypatch.setattr(health.settings, "axion_min_days_between_rollout_increase", 7)
    monkeypatch.setattr(health, "_active_experiment_variant_count", lambda *_args, **_kwargs: 2)
    monkeypatch.setattr(health, "_get_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A"])
    monkeypatch.setattr(health, "_current_rollout_percent", lambda *_args, **_kwargs: 5)
    monkeypatch.setattr(health, "_last_rollout_scaled_at", lambda *_args, **_kwargs: datetime.now(UTC) - timedelta(days=8))
    monkeypatch.setattr(
        health,
        "_update_rollout_percent",
        lambda *_args, **kwargs: state.__setitem__("updated_to", kwargs.get("rollout_percent")) or 2,
    )
    monkeypatch.setattr(health, "_resolve_audit_context", lambda *_args, **_kwargs: (1, 1))
    monkeypatch.setattr(health, "_write_rollout_scaled_audit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(health, "_write_stat_sig_event", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        health,
        "_write_rollout_increased_event",
        lambda *_args, **_kwargs: state.__setitem__("event_calls", int(state["event_calls"]) + 1),
    )

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {"cta_click_users": 1000, "cta_session_started_converted_users": 300}
        if variant == "VARIANT_A":
            return {"cta_click_users": 1000, "cta_session_started_converted_users": 380}
        return {"cta_click_users": 2000, "cta_session_started_converted_users": 680}

    monkeypatch.setattr(health, "get_axion_retention_metrics", _fake_metrics)
    result = health.evaluate_rollout_progression(db, experiment_key="nba_retention_v1", auto_commit=True)

    assert result.scaled is True
    assert result.reason == "rollout_scaled"
    assert result.previous_rollout_percent == 5
    assert result.new_rollout_percent == 10
    assert state["updated_to"] == 10
    assert state["event_calls"] == 1
