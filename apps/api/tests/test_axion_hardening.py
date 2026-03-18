from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from pathlib import Path
import re
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.axion import _load_user_decision
from app.models import AxionDecision, AxionDecisionContext, AxionExperiment, AxionFeatureRegistry, AxionFeatureSnapshot, AxionRewardContract
from app.models import Plan
from app.services import axion_flags
from app.services import axion_mode
from app.services.axion_experiments import resolve_nba_variant
from app.services.axion_facts import AxionFacts, EnergyFacts, RecentApprovalsFacts, WalletFacts
from app.services.axion_mode import NbaModeResolution
from app.services.axion_orchestrator import AxionOrchestratorDecision, select_next_best_action
from app.services.axion_core_v2 import AxionStateSnapshot
from app.services.llm_gate import _execution_mode_for_plan


class _FakeScalarRows:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def all(self) -> list[object]:
        return self._rows


class _FakeDBForExperiments:
    def __init__(self, rows: list[AxionExperiment]) -> None:
        self._rows = rows

    def scalars(self, *_args: object, **_kwargs: object) -> _FakeScalarRows:
        return _FakeScalarRows(self._rows)


class _FakeDBWithAdd:
    def __init__(self) -> None:
        self.added: list[object] = []

    def add(self, item: object) -> None:
        self.added.append(item)


class _FakeDBWithAddAndScalar(_FakeDBWithAdd):
    def scalar(self, *_args: object, **_kwargs: object):
        return None


def test_feature_flag_defaults_true_when_child_missing_or_column_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        pass

    monkeypatch.setattr(axion_flags, "_has_nba_flag_column", lambda _db: False)
    assert axion_flags.is_nba_enabled(_DB(), child_id=10) is True
    assert axion_flags.is_nba_enabled(_DB(), child_id=None) is True


def test_feature_flag_control_group_returns_false(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        def scalar(self, *_args: object, **_kwargs: object) -> bool:
            return False

    monkeypatch.setattr(axion_flags, "_has_nba_flag_column", lambda _db: True)
    assert axion_flags.is_nba_enabled(_DB(), child_id=7) is False


def test_ab_assignment_is_deterministic_per_child() -> None:
    rows = [
        AxionExperiment(
            experiment_id="nba_daily",
            variant="A",
            allocation_percentage=50,
            active=True,
            start_date=date(2026, 1, 1),
            end_date=None,
        ),
        AxionExperiment(
            experiment_id="nba_daily",
            variant="B",
            allocation_percentage=50,
            active=True,
            start_date=date(2026, 1, 1),
            end_date=None,
        ),
    ]
    db = _FakeDBForExperiments(rows)
    first = resolve_nba_variant(db, child_id=42)
    second = resolve_nba_variant(db, child_id=42)
    assert first is not None
    assert second is not None
    assert first.experiment_id == second.experiment_id
    assert first.variant == second.variant


def test_cooldown_blocks_new_policy_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(UTC)
    state = AxionStateSnapshot(
        user_id=1,
        rhythm_score=0.5,
        frustration_score=0.2,
        confidence_score=0.6,
        dropout_risk_score=0.1,
        learning_momentum=0.02,
        last_active_at=now,
        updated_at=now,
        debug={},
    )
    facts = AxionFacts(
        last_active_at=now,
        streak_days=3,
        weekly_completion_rate=0.6,
        recent_approvals=RecentApprovalsFacts(approved=2, rejected=0),
        due_reviews_count=1,
        weakest_skills=[],
        strongest_skills=[],
        last_lesson=None,
        wallet=WalletFacts(total=0, spend=0, save=0, donate=0),
        energy=EnergyFacts(current=5, regen_eta=0),
    )
    monkeypatch.setattr(
        "app.services.axion_orchestrator._active_cooldown_decision",
        lambda *_args, **_kwargs: SimpleNamespace(cooldown_until=now + timedelta(minutes=30)),
    )
    decision = select_next_best_action(
        db=SimpleNamespace(),
        user_id=1,
        tenant_id=10,
        child_id=20,
        context=AxionDecisionContext.CHILD_TAB,
        state=state,
        facts=facts,
    )
    assert decision.source == "cooldown"
    assert decision.action_type == "OFFER_MICRO_MISSION"


def test_plan_gating_modes() -> None:
    assert _execution_mode_for_plan("FREE") == "deterministic"
    assert _execution_mode_for_plan("PRO") == "rule_cache"
    assert _execution_mode_for_plan("PREMIUM") == "llm"


def test_multi_tenant_isolation_blocks_foreign_decision() -> None:
    class _DB:
        def __init__(self, decision: object) -> None:
            self._decision = decision

        def scalar(self, *_args: object, **_kwargs: object) -> object:
            return self._decision

    decision = SimpleNamespace(id="d1", user_id=5, tenant_id=999, child_id=12)
    with pytest.raises(HTTPException) as exc:
        _load_user_decision(
            _DB(decision),
            decision_id="d1",
            user_id=5,
            tenant_id=100,
        )
    assert exc.value.status_code == 404


@pytest.mark.parametrize(
    ("assignment_variant", "plan_enabled", "child_flag", "expected_enabled", "expected_reason"),
    [
        ("CONTROL", True, True, False, "experiment_control"),
        ("VARIANT_A", False, True, True, "experiment_variant"),
        (None, False, True, False, "plan_disabled"),
        (None, True, False, False, "child_flag_disabled"),
        (None, True, True, True, "default"),
    ],
)
def test_resolve_nba_mode_precedence(
    monkeypatch: pytest.MonkeyPatch,
    assignment_variant: str | None,
    plan_enabled: bool,
    child_flag: bool,
    expected_enabled: bool,
    expected_reason: str,
) -> None:
    class _DB:
        pass

    def _fake_assignment(*_args: object, **_kwargs: object) -> object | None:
        if assignment_variant is None:
            return None
        return SimpleNamespace(experiment_id="nba_retention_v1", variant=assignment_variant)

    monkeypatch.setattr(axion_mode, "resolve_nba_variant_for_experiment", _fake_assignment)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=plan_enabled,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: child_flag)
    mode = axion_mode.resolve_nba_mode(
        _DB(),
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
    )
    assert mode.enabled is expected_enabled
    assert mode.reason == expected_reason


def test_experiment_override_respects_flag_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        pass

    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="FREE",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=False,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", False)

    mode = axion_mode.resolve_nba_mode(
        _DB(),
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
    )
    assert mode.enabled is False
    assert mode.reason == "plan_disabled"
    assert mode.variant == "VARIANT_A"
    assert mode.experiment_key == "nba_retention_v1"


def test_experiment_override_respects_flag_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        pass

    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="FREE",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=False,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)

    mode = axion_mode.resolve_nba_mode(
        _DB(),
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
    )
    assert mode.enabled is True
    assert mode.reason == "experiment_variant"
    assert mode.variant == "VARIANT_A"
    assert mode.experiment_key == "nba_retention_v1"


def test_experiment_override_default_false_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", None)
    monkeypatch.setattr(axion_mode.settings, "app_env", "production")
    assert axion_mode._experiment_can_override_plan() is False


def test_experiment_override_default_true_in_staging(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", None)
    monkeypatch.setattr(axion_mode.settings, "app_env", "staging")
    assert axion_mode._experiment_can_override_plan() is True


def test_rollout_blocks_when_percent_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        pass

    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode.settings, "app_env", "production")
    monkeypatch.setattr(axion_mode.settings, "axion_production_rollout_percent", 0)

    mode = axion_mode.resolve_nba_mode(
        _DB(),
        tenant_id=1,
        child_id=123,
        user_id=99,
        context="child_tab",
    )
    assert mode.enabled is False
    assert mode.reason == "production_rollout_guard"


def test_rollout_allows_when_percent_100(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        pass

    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode.settings, "app_env", "production")
    monkeypatch.setattr(axion_mode.settings, "axion_production_rollout_percent", 100)

    mode = axion_mode.resolve_nba_mode(
        _DB(),
        tenant_id=1,
        child_id=123,
        user_id=99,
        context="child_tab",
    )
    assert mode.enabled is True
    assert mode.reason == "experiment_variant"


def test_rollout_is_deterministic(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(axion_mode.settings, "axion_production_rollout_percent", 37)
    first = axion_mode._is_within_production_rollout("child-123")
    second = axion_mode._is_within_production_rollout("child-123")
    assert first == second


def test_latency_metric_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAdd()
    monkeypatch.setattr(axion_mode.settings, "app_env", "staging")
    monkeypatch.setattr(axion_mode, "resolve_nba_variant_for_experiment", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    mode = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
    )

    assert mode.enabled is True
    events = [item for item in db.added if getattr(item, "type", "") == "axion_decision_latency_ms"]
    assert len(events) == 1
    event = events[0]
    assert getattr(event, "type") == "axion_decision_latency_ms"
    payload = getattr(event, "payload")
    assert "start_time" in payload
    assert "end_time" in payload
    assert "duration_ms" in payload
    assert payload["environment"] == "staging"


def test_feature_snapshot_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAdd()
    monkeypatch.setattr(axion_mode.settings, "app_env", "staging")
    monkeypatch.setattr(axion_mode, "resolve_nba_variant_for_experiment", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    mode = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
    )

    assert mode.enabled is True
    snapshots = [item for item in db.added if isinstance(item, AxionFeatureSnapshot)]
    assert len(snapshots) == 1
    snapshot = snapshots[0]
    assert snapshot.user_id == 30
    assert snapshot.tenant_id == 10
    assert snapshot.experiment_key is None
    assert snapshot.variant is None
    assert snapshot.feature_version == 1
    assert snapshot.features_json["context"] == "child_tab"
    assert snapshot.features_json["child_id"] == 20
    assert snapshot.features_json["nba_enabled_final"] is True


def test_decision_row_written_level4(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAdd()
    monkeypatch.setattr(axion_mode.settings, "app_env", "staging")
    monkeypatch.setattr(axion_mode, "resolve_nba_variant_for_experiment", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    _ = axion_mode.resolve_nba_mode(
        db,
        tenant_id=1,
        child_id=10,
        user_id=20,
        context="child_tab",
    )
    rows = [item for item in db.added if item.__class__.__name__ == "AxionDecision"]
    assert len(rows) == 1
    row = rows[0]
    assert row.decision_mode == "level4"
    assert row.policy_version is None


def test_decision_row_written_policy_canary(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: "CANARY")
    monkeypatch.setattr(axion_mode, "_is_within_rollout_for_percent", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(axion_mode, "_apply_epsilon_greedy_variant", lambda *_args, **_kwargs: ("VARIANT_B", False))
    monkeypatch.setattr(axion_mode, "_latest_policy_version", lambda *_args, **_kwargs: 12)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)

    _ = axion_mode.resolve_nba_mode(
        db,
        tenant_id=1,
        child_id=10,
        user_id=20,
        context="child_tab",
    )
    rows = [item for item in db.added if item.__class__.__name__ == "AxionDecision"]
    assert len(rows) == 1
    row = rows[0]
    assert row.decision_mode == "policy"
    assert row.policy_state == "CANARY"
    assert row.policy_version == 12
    assert row.chosen_variant == "VARIANT_B"


def test_decision_includes_policy_version_and_exploration_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: "ACTIVE")
    monkeypatch.setattr(axion_mode, "_resolve_rollout_percent", lambda *_args, **_kwargs: 100)
    monkeypatch.setattr(axion_mode, "_apply_epsilon_greedy_variant", lambda *_args, **_kwargs: ("VARIANT_B", True))
    monkeypatch.setattr(axion_mode, "_latest_policy_version", lambda *_args, **_kwargs: 7)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)

    _ = axion_mode.resolve_nba_mode(
        db,
        tenant_id=1,
        child_id=10,
        user_id=20,
        context="child_tab",
    )
    rows = [item for item in db.added if item.__class__.__name__ == "AxionDecision"]
    assert len(rows) == 1
    row = rows[0]
    assert row.policy_version == 7
    assert row.exploration_flag is True
    assert row.decision_mode == "policy"


def test_only_one_active_feature_version() -> None:
    unique_active_indexes = [
        idx
        for idx in AxionFeatureRegistry.__table__.indexes
        if idx.name == "uq_axion_feature_registry_single_active"
    ]
    assert len(unique_active_indexes) == 1
    index = unique_active_indexes[0]
    assert index.unique is True


def test_only_one_reward_contract_active() -> None:
    unique_active_indexes = [
        idx
        for idx in AxionRewardContract.__table__.indexes
        if idx.name == "uq_axion_reward_contract_single_active"
    ]
    assert len(unique_active_indexes) == 1
    index = unique_active_indexes[0]
    assert index.unique is True


def test_epsilon_exploration_rate_approximate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(axion_mode.settings, "axion_epsilon", 0.1)
    monkeypatch.setattr(axion_mode, "_list_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A", "VARIANT_B"])
    monkeypatch.setattr(axion_mode, "_best_policy_variant", lambda *_args, **_kwargs: "VARIANT_A")

    explored = 0
    total = 2000
    for child_id in range(1, total + 1):
        _variant, is_exploring = axion_mode._apply_epsilon_greedy_variant(
            SimpleNamespace(),
            child_id=child_id,
            experiment_key="nba_retention_v1",
            default_variant="VARIANT_A",
        )
        if is_exploring:
            explored += 1
    observed = explored / total
    assert 0.07 <= observed <= 0.13


def test_bandit_uses_best_variant_when_not_exploring(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(axion_mode.settings, "axion_epsilon", 0.0)
    monkeypatch.setattr(axion_mode, "_list_active_variants", lambda *_args, **_kwargs: ["CONTROL", "VARIANT_A", "VARIANT_B"])
    monkeypatch.setattr(axion_mode, "_best_policy_variant", lambda *_args, **_kwargs: "VARIANT_B")

    variant, is_exploring = axion_mode._apply_epsilon_greedy_variant(
        SimpleNamespace(),
        child_id=99,
        experiment_key="nba_retention_v1",
        default_variant="VARIANT_A",
    )
    assert is_exploring is False
    assert variant == "VARIANT_B"


def test_shadow_never_changes_variant(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        pass

    called = {"bandit": 0}
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: "SHADOW")
    monkeypatch.setattr(
        axion_mode,
        "_apply_epsilon_greedy_variant",
        lambda *_args, **_kwargs: called.__setitem__("bandit", int(called["bandit"]) + 1) or ("VARIANT_B", True),
    )
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)

    mode = axion_mode.resolve_nba_mode(_DB(), tenant_id=1, child_id=10, user_id=20, context="child_tab")

    assert called["bandit"] == 0
    assert mode.variant == "VARIANT_A"
    assert mode.policy_state == "SHADOW"
    assert mode.policy_serving_reason == "policy_shadow_block"


def test_canary_allows_only_in_5_percent(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        def scalar(self, *_args: object, **_kwargs: object):
            return None

    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: "CANARY")
    monkeypatch.setattr(
        axion_mode,
        "_is_within_rollout_for_percent",
        lambda subject, percent: (subject == "1:5" and percent == 5),
    )
    monkeypatch.setattr(axion_mode, "_apply_epsilon_greedy_variant", lambda *_args, **_kwargs: ("VARIANT_B", True))
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)

    canary_mode = axion_mode.resolve_nba_mode(_DB(), tenant_id=1, child_id=5, user_id=20, context="child_tab")
    outside_mode = axion_mode.resolve_nba_mode(_DB(), tenant_id=1, child_id=6, user_id=20, context="child_tab")

    assert canary_mode.variant == "VARIANT_B"
    assert canary_mode.exploration_flag is True
    assert canary_mode.policy_serving_reason == "policy_canary_serving"
    assert outside_mode.variant == "VARIANT_A"
    assert outside_mode.exploration_flag is False
    assert outside_mode.policy_serving_reason == "policy_canary_serving"


def test_active_allows_policy_serving(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        def scalar(self, *_args: object, **_kwargs: object):
            return None

    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: "ACTIVE")
    monkeypatch.setattr(axion_mode, "_resolve_rollout_percent", lambda *_args, **_kwargs: 100)
    monkeypatch.setattr(axion_mode, "_apply_epsilon_greedy_variant", lambda *_args, **_kwargs: ("VARIANT_B", False))
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)

    mode = axion_mode.resolve_nba_mode(_DB(), tenant_id=1, child_id=12, user_id=20, context="child_tab")

    assert mode.variant == "VARIANT_B"
    assert mode.policy_state == "ACTIVE"
    assert mode.policy_serving_reason == "policy_active_serving"


def test_rolled_back_blocks_policy_serving(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        def scalar(self, *_args: object, **_kwargs: object):
            return None

    called = {"bandit": 0}
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: "ROLLED_BACK")
    monkeypatch.setattr(
        axion_mode,
        "_apply_epsilon_greedy_variant",
        lambda *_args, **_kwargs: called.__setitem__("bandit", int(called["bandit"]) + 1) or ("VARIANT_B", True),
    )
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)

    mode = axion_mode.resolve_nba_mode(_DB(), tenant_id=1, child_id=10, user_id=20, context="child_tab")

    assert called["bandit"] == 0
    assert mode.variant == "VARIANT_A"
    assert mode.policy_state == "ROLLED_BACK"
    assert mode.policy_serving_reason == "policy_rolled_back"


def test_kill_switch_blocks_policy_serving(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        def __init__(self) -> None:
            self.added: list[object] = []

        def scalar(self, *_args: object, **_kwargs: object):
            return None

        def add(self, item: object) -> None:
            self.added.append(item)

        def flush(self) -> None:
            for item in self.added:
                if isinstance(item, AxionDecision) and getattr(item, "id", None) is None:
                    item.id = uuid4()

    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: True)
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )

    def _bandit_should_not_run(*_args: object, **_kwargs: object):
        raise AssertionError("bandit must not run when kill-switch is enabled")

    monkeypatch.setattr(axion_mode, "_apply_epsilon_greedy_variant", _bandit_should_not_run)
    db = _DB()
    mode = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
    )
    assert mode.enabled is False
    assert mode.reason == "kill_switch_enabled"
    assert mode.policy_state == "ROLLED_BACK"
    decisions = [item for item in db.added if isinstance(item, AxionDecision)]
    assert len(decisions) == 1
    assert decisions[0].policy_state == "ROLLED_BACK"
    assert decisions[0].decision_mode == "level4"
    events = [item for item in db.added if getattr(item, "type", "") == "axion_kill_switch_triggered"]
    assert len(events) == 1


def test_kill_switch_overrides_idempotent_replay(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DB:
        def __init__(self) -> None:
            self.added: list[object] = []

        def scalar(self, *_args: object, **_kwargs: object):
            return None

        def add(self, item: object) -> None:
            self.added.append(item)

        def flush(self) -> None:
            for item in self.added:
                if isinstance(item, AxionDecision) and getattr(item, "id", None) is None:
                    item.id = uuid4()

    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: True)
    monkeypatch.setattr(
        axion_mode,
        "_find_existing_decision_by_correlation",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("idempotent replay lookup must be bypassed")),
    )
    db = _DB()
    correlation = "11111111-1111-4111-8111-111111111111"

    first = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
        correlation_id=correlation,
    )
    second = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
        correlation_id=correlation,
    )

    assert first.reason == "kill_switch_enabled"
    assert second.reason == "kill_switch_enabled"
    decision_rows = [item for item in db.added if isinstance(item, AxionDecision)]
    assert len(decision_rows) == 2
    assert decision_rows[0].policy_state == "ROLLED_BACK"
    assert decision_rows[1].policy_state == "ROLLED_BACK"
    assert decision_rows[0].correlation_id != decision_rows[1].correlation_id


def test_policy_governance_end_to_end_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    state = {"policy_state": "SHADOW", "bandit_calls": 0}

    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: state["policy_state"])
    monkeypatch.setattr(axion_mode.settings, "app_env", "staging")
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)
    monkeypatch.setattr(axion_mode, "_latest_policy_version", lambda *_args, **_kwargs: 42)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    def _fake_rollout_gate(subject: str, percent: int) -> bool:
        child_int = int(str(subject).split(":")[-1])
        if percent == 5:
            return child_int % 20 == 0  # 5%
        if percent == 40:
            return child_int % 10 < 4  # 40%
        return False

    monkeypatch.setattr(axion_mode, "_is_within_rollout_for_percent", _fake_rollout_gate)
    monkeypatch.setattr(axion_mode, "_resolve_rollout_percent", lambda *_args, **_kwargs: 40)

    def _bandit(*_args, **_kwargs):
        state["bandit_calls"] = int(state["bandit_calls"]) + 1
        return ("VARIANT_B", False)

    monkeypatch.setattr(axion_mode, "_apply_epsilon_greedy_variant", _bandit)

    # SHADOW
    state["policy_state"] = "SHADOW"
    axion_mode.resolve_nba_mode(db, tenant_id=1, child_id=101, user_id=1, context="child_tab")

    # CANARY (200 calls -> 10 policy decisions expected with 5% gate)
    state["policy_state"] = "CANARY"
    for idx in range(1, 201):
        axion_mode.resolve_nba_mode(db, tenant_id=1, child_id=idx, user_id=1000 + idx, context="child_tab")

    # ACTIVE (50 calls -> 20 policy decisions expected with 40% gate)
    state["policy_state"] = "ACTIVE"
    for idx in range(1, 51):
        axion_mode.resolve_nba_mode(db, tenant_id=1, child_id=idx, user_id=2000 + idx, context="child_tab")

    # ROLLED_BACK
    state["policy_state"] = "ROLLED_BACK"
    for idx in range(1, 51):
        axion_mode.resolve_nba_mode(db, tenant_id=1, child_id=idx, user_id=3000 + idx, context="child_tab")

    decision_rows = [item for item in db.added if item.__class__.__name__ == "AxionDecision"]
    assert len(decision_rows) == 301

    shadow_rows = [item for item in decision_rows if item.policy_state == "SHADOW"]
    canary_rows = [item for item in decision_rows if item.policy_state == "CANARY"]
    active_rows = [item for item in decision_rows if item.policy_state == "ACTIVE"]
    rolled_rows = [item for item in decision_rows if item.policy_state == "ROLLED_BACK"]

    assert len(shadow_rows) == 1
    assert shadow_rows[0].decision_mode == "level4"
    assert shadow_rows[0].reason_code == "policy_shadow_block"

    canary_policy_rows = [item for item in canary_rows if item.decision_mode == "policy"]
    assert 8 <= len(canary_policy_rows) <= 12
    assert all(item.policy_version is not None for item in canary_policy_rows)

    active_policy_rows = [item for item in active_rows if item.decision_mode == "policy"]
    assert len(active_policy_rows) == 20
    assert all(item.policy_version is not None for item in active_policy_rows)

    assert all(item.decision_mode == "level4" for item in rolled_rows)
    assert all(item.policy_version is None for item in rolled_rows)
    assert all(item.reason_code == "policy_rolled_back" for item in rolled_rows)

    assert state["bandit_calls"] == (len(canary_policy_rows) + len(active_policy_rows))


def test_rollout_percentage_behavior(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    monkeypatch.setattr(axion_mode.settings, "app_env", "staging")
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)
    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: "ACTIVE")
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode, "_latest_policy_version", lambda *_args, **_kwargs: 7)
    monkeypatch.setattr(axion_mode, "_apply_epsilon_greedy_variant", lambda *_args, **_kwargs: ("VARIANT_B", False))
    monkeypatch.setattr(axion_mode, "_resolve_rollout_percent", lambda *_args, **_kwargs: 100)

    # Deterministic bucket for same tenant+child.
    monkeypatch.setattr(axion_mode, "_rollout_bucket_for_subject", lambda _subject: 12)

    monkeypatch.setattr(
        axion_mode,
        "get_current_policy_rollout_percentage",
        lambda *_args, **_kwargs: 10,
    )
    low = axion_mode.resolve_nba_mode(
        db,
        tenant_id=55,
        child_id=321,
        user_id=999,
        context="child_tab",
    )
    low_repeat = axion_mode.resolve_nba_mode(
        db,
        tenant_id=55,
        child_id=321,
        user_id=1000,
        context="child_tab",
    )
    assert low.policy_applied is False
    assert low_repeat.policy_applied is False

    monkeypatch.setattr(
        axion_mode,
        "get_current_policy_rollout_percentage",
        lambda *_args, **_kwargs: 25,
    )
    high = axion_mode.resolve_nba_mode(
        db,
        tenant_id=55,
        child_id=321,
        user_id=1001,
        context="child_tab",
    )
    assert high.policy_applied is True
    assert high.policy_version == 7


def test_rollout_0_percent_never_serves_policy(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    monkeypatch.setattr(axion_mode.settings, "app_env", "staging")
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)
    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: "ACTIVE")
    monkeypatch.setattr(axion_mode, "get_current_policy_rollout_percentage", lambda *_args, **_kwargs: 0)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode, "_latest_policy_version", lambda *_args, **_kwargs: 3)
    called = {"bandit": 0}
    monkeypatch.setattr(
        axion_mode,
        "_apply_epsilon_greedy_variant",
        lambda *_args, **_kwargs: called.__setitem__("bandit", int(called["bandit"]) + 1) or ("VARIANT_B", False),
    )

    for child_id in range(1, 21):
        mode = axion_mode.resolve_nba_mode(
            db,
            tenant_id=1,
            child_id=child_id,
            user_id=1000 + child_id,
            context="child_tab",
        )
        assert mode.policy_applied is False
        assert mode.policy_state == "ACTIVE"

    assert called["bandit"] == 0


def test_rollout_100_percent_always_serves_policy(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    monkeypatch.setattr(axion_mode.settings, "app_env", "staging")
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)
    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: "ACTIVE")
    monkeypatch.setattr(axion_mode, "get_current_policy_rollout_percentage", lambda *_args, **_kwargs: 100)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode, "_latest_policy_version", lambda *_args, **_kwargs: 9)
    monkeypatch.setattr(axion_mode, "_apply_epsilon_greedy_variant", lambda *_args, **_kwargs: ("VARIANT_B", False))

    for child_id in range(1, 31):
        mode = axion_mode.resolve_nba_mode(
            db,
            tenant_id=1,
            child_id=child_id,
            user_id=2000 + child_id,
            context="child_tab",
        )
        assert mode.policy_applied is True
        assert mode.policy_version == 9


def test_rollout_50_percent_deterministic_behavior(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    monkeypatch.setattr(axion_mode.settings, "app_env", "staging")
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)
    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: "ACTIVE")
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)
    monkeypatch.setattr(axion_mode, "_latest_policy_version", lambda *_args, **_kwargs: 11)
    monkeypatch.setattr(axion_mode, "_apply_epsilon_greedy_variant", lambda *_args, **_kwargs: ("VARIANT_B", False))
    monkeypatch.setattr(
        axion_mode,
        "_rollout_bucket_for_subject",
        lambda subject: int(str(subject).split(":")[-1]) % 100,
    )

    def _served_ids(rollout: int) -> set[int]:
        monkeypatch.setattr(axion_mode, "get_current_policy_rollout_percentage", lambda *_args, **_kwargs: rollout)
        served: set[int] = set()
        for child_id in range(1, 101):
            mode = axion_mode.resolve_nba_mode(
                db,
                tenant_id=77,
                child_id=child_id,
                user_id=3000 + child_id,
                context="child_tab",
            )
            if mode.policy_applied:
                served.add(child_id)
        return served

    served_50_first = _served_ids(50)
    served_50_second = _served_ids(50)
    served_60 = _served_ids(60)

    assert served_50_first == served_50_second
    assert len(served_50_first) == 50
    assert served_50_first.issubset(served_60)
    assert len(served_60) == 60
    additional = served_60 - served_50_first
    assert len(additional) == 10


def test_age_gating_blocks_out_of_range_candidates(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)
    monkeypatch.setattr(axion_mode, "resolve_child_age", lambda *_args, **_kwargs: 6)
    monkeypatch.setattr(axion_mode, "filter_candidate_content_ids_by_age", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(axion_mode, "_safe_default_candidates", lambda *_args, **_kwargs: ([], "noop"))
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("should not reach decision stage")),
    )

    mode = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
        child_age=6,
        candidate_content_ids=[101, 102, 103],
    )
    assert mode.enabled is False
    assert mode.reason == "age_gating_blocked"
    assert mode.policy_state == "ROLLED_BACK"


def test_age_gating_allows_in_range_candidates(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)
    monkeypatch.setattr(axion_mode, "resolve_child_age", lambda *_args, **_kwargs: 9)
    monkeypatch.setattr(axion_mode, "filter_candidate_content_ids_by_age", lambda *_args, **_kwargs: [201])
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    mode = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
        child_age=9,
        candidate_content_ids=[201, 202],
    )
    assert mode.enabled is True
    assert mode.reason == "experiment_variant"


def test_age_used_from_date_of_birth_not_from_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    resolve_calls: list[dict[str, object]] = []
    age_gating_ages: list[int] = []
    safety_gating_ages: list[int] = []

    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)

    def _resolve_child_age(_db, *, child_id: int | None, **kwargs: object) -> int | None:
        resolve_calls.append({"child_id": child_id, **kwargs})
        return 6

    def _age_gate(_db, *, candidate_content_ids: list[int], child_age: int) -> list[int]:
        age_gating_ages.append(int(child_age))
        return [int(item) for item in candidate_content_ids]

    def _safety_gate(_db, *, candidate_content_ids: list[int], child_age: int) -> list[int]:
        safety_gating_ages.append(int(child_age))
        return [int(item) for item in candidate_content_ids]

    monkeypatch.setattr(axion_mode, "resolve_child_age", _resolve_child_age)
    monkeypatch.setattr(axion_mode, "filter_candidate_content_ids_by_age", _age_gate)
    monkeypatch.setattr(axion_mode, "filter_candidates_by_safety_tags", _safety_gate)
    monkeypatch.setattr(axion_mode, "filter_candidates_by_prerequisites", lambda *_args, **_kwargs: [301])
    monkeypatch.setattr(axion_mode, "filter_repeated_candidates", lambda *_args, **_kwargs: [301])
    monkeypatch.setattr(axion_mode, "resolve_nba_variant_for_experiment", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    mode = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
        child_age=17,  # stale/manual cache value that must be ignored
        candidate_content_ids=[301],
    )
    assert resolve_calls == [{"child_id": 20}]
    assert age_gating_ages == [6]
    assert safety_gating_ages == [6]
    assert mode.enabled is True
    assert mode.selected_content_id == 301


def test_guardrails_pipeline_blocks_and_fallbacks_correctly(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    calls: list[str] = []
    blocked_reasons: list[str] = []
    fallback_hits: list[int] = []

    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(axion_mode, "resolve_child_age", lambda *_args, **_kwargs: 9)
    monkeypatch.setattr(axion_mode, "filter_candidate_content_ids_by_age", lambda *_args, **_kwargs: (calls.append("age") or [101]))
    monkeypatch.setattr(axion_mode, "filter_candidates_by_safety_tags", lambda *_args, **_kwargs: (calls.append("safety") or []))
    monkeypatch.setattr(
        axion_mode,
        "filter_candidates_by_prerequisites",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("prerequisites should not run after safety block")),
    )
    monkeypatch.setattr(
        axion_mode,
        "filter_repeated_candidates",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("anti-dup should not run after safety block")),
    )
    monkeypatch.setattr(axion_mode, "_safe_default_candidates", lambda *_args, **_kwargs: ([999], "age_safe"))
    monkeypatch.setattr(axion_mode, "safe_increment_guardrails_block_total", lambda reason: blocked_reasons.append(str(reason)))
    monkeypatch.setattr(axion_mode, "safe_increment_guardrails_fallback_total", lambda: fallback_hits.append(1))
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    mode = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
        child_age=9,
        candidate_content_ids=[101, 102],
    )
    assert mode.enabled is True
    assert mode.reason == "default"
    assert calls == ["age", "safety"]
    assert blocked_reasons == ["safety_tags_blocked"]
    assert fallback_hits == [1]
    fallback_events = [item for item in db.added if item.__class__.__name__ == "EventLog" and getattr(item, "type", "") == "axion_guardrails_fallback"]
    assert len(fallback_events) == 1


def test_fallback_works_without_neutral_subject(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(axion_mode, "resolve_child_age", lambda *_args, **_kwargs: 9)
    monkeypatch.setattr(axion_mode, "filter_candidate_content_ids_by_age", lambda *_args, **_kwargs: [501, 502])
    monkeypatch.setattr(axion_mode, "filter_candidates_by_safety_tags", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(axion_mode, "_safe_default_candidates", lambda *_args, **_kwargs: ([777], "age_safe"))
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    mode = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
        child_age=9,
        candidate_content_ids=[501, 502],
    )
    assert mode.enabled is True
    assert mode.selected_content_id == 777
    fallback_event = next(item for item in db.added if item.__class__.__name__ == "EventLog" and getattr(item, "type", "") == "axion_guardrails_fallback")
    assert fallback_event.payload.get("fallback_source") == "age_safe"
    assert fallback_event.payload.get("fallback_candidate_ids") == [777]


def test_fallback_never_returns_empty_candidates(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(axion_mode, "resolve_child_age", lambda *_args, **_kwargs: 8)
    monkeypatch.setattr(axion_mode, "filter_candidate_content_ids_by_age", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(axion_mode, "_safe_default_candidates", lambda *_args, **_kwargs: ([990031], "noop"))
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    mode = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
        child_age=8,
        candidate_content_ids=[111],
    )
    assert mode.enabled is True
    assert mode.selected_content_id == 990031
    critical = [item for item in db.added if item.__class__.__name__ == "EventLog" and getattr(item, "type", "") == "axion_guardrails_fallback_critical"]
    assert len(critical) == 1


def test_guardrails_do_not_change_single_writer_invariants(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()

    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(axion_mode, "resolve_child_age", lambda *_args, **_kwargs: 11)
    monkeypatch.setattr(axion_mode, "filter_candidate_content_ids_by_age", lambda *_args, **_kwargs: [201, 202])
    monkeypatch.setattr(axion_mode, "filter_candidates_by_safety_tags", lambda *_args, **_kwargs: [201, 202])
    monkeypatch.setattr(axion_mode, "filter_candidates_by_prerequisites", lambda *_args, **_kwargs: [201])
    monkeypatch.setattr(axion_mode, "filter_repeated_candidates", lambda *_args, **_kwargs: [201])
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    mode = axion_mode.resolve_nba_mode(
        db,
        tenant_id=10,
        child_id=20,
        user_id=30,
        context="child_tab",
        child_age=11,
        candidate_content_ids=[201, 202],
    )
    assert mode.enabled is True
    decisions = [item for item in db.added if item.__class__.__name__ == "AxionDecision"]
    assert len(decisions) == 1


def test_guardrails_filtered_set_is_used_by_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBWithAddAndScalar()
    seen_bandit_pool: list[list[int] | None] = []

    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(axion_mode.settings, "app_env", "staging")
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)
    monkeypatch.setattr(axion_mode, "resolve_child_age", lambda *_args, **_kwargs: 11)
    monkeypatch.setattr(axion_mode, "filter_candidate_content_ids_by_age", lambda *_args, **_kwargs: [701, 702])
    monkeypatch.setattr(axion_mode, "filter_candidates_by_safety_tags", lambda *_args, **_kwargs: [702])
    monkeypatch.setattr(axion_mode, "filter_candidates_by_prerequisites", lambda *_args, **_kwargs: [702])
    monkeypatch.setattr(axion_mode, "filter_repeated_candidates", lambda *_args, **_kwargs: [702])
    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "get_current_policy_state", lambda *_args, **_kwargs: "ACTIVE")
    monkeypatch.setattr(axion_mode, "get_current_policy_rollout_percentage", lambda *_args, **_kwargs: 100)
    monkeypatch.setattr(axion_mode, "_latest_policy_version", lambda *_args, **_kwargs: 7)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    def _bandit(*_args, **kwargs):
        seen_bandit_pool.append(kwargs.get("candidate_content_ids"))
        return ("VARIANT_B", False)

    monkeypatch.setattr(axion_mode, "_apply_epsilon_greedy_variant", _bandit)

    mode = axion_mode.resolve_nba_mode(
        db,
        tenant_id=44,
        child_id=55,
        user_id=66,
        context="child_tab",
        candidate_content_ids=[701, 702],  # 701 blocked by safety, 702 allowed
        child_age=11,
    )
    assert mode.enabled is True
    assert mode.policy_applied is True
    assert mode.selected_content_id == 702
    assert seen_bandit_pool == [[702]]
    decision = next(item for item in db.added if item.__class__.__name__ == "AxionDecision")
    assert decision.metadata_json.get("selected_content_id") == 702


class _FakeDBForBrief:
    def __init__(self) -> None:
        self.added: list[object] = []

    def add(self, item: object) -> None:
        self.added.append(item)

    def flush(self) -> None:
        if not self.added:
            return
        latest = self.added[-1]
        if getattr(latest, "id", None) in {None, ""}:
            setattr(latest, "id", str(uuid4()))

    def commit(self) -> None:
        return


class _FakeEvents:
    def __init__(self) -> None:
        self.items: list[dict[str, object]] = []

    def emit(self, **payload: object) -> None:
        self.items.append(payload)


def _stub_state(now: datetime) -> AxionStateSnapshot:
    return AxionStateSnapshot(
        user_id=20,
        rhythm_score=0.55,
        frustration_score=0.22,
        confidence_score=0.61,
        dropout_risk_score=0.12,
        learning_momentum=0.03,
        last_active_at=now,
        updated_at=now,
        debug={},
    )


def _stub_facts(now: datetime) -> AxionFacts:
    return AxionFacts(
        last_active_at=now,
        streak_days=4,
        weekly_completion_rate=0.7,
        recent_approvals=RecentApprovalsFacts(approved=3, rejected=1),
        due_reviews_count=2,
        weakest_skills=[],
        strongest_skills=[],
        last_lesson=None,
        wallet=WalletFacts(total=0, spend=0, save=0, donate=0),
        energy=EnergyFacts(current=4, regen_eta=0),
    )


def test_axion_facts_to_dict_serializes_last_active_at_isoformat() -> None:
    now = datetime(2026, 3, 18, 14, 30, tzinfo=UTC)
    facts = AxionFacts(
        last_active_at=now,
        streak_days=3,
        weekly_completion_rate=0.6,
        recent_approvals=RecentApprovalsFacts(approved=2, rejected=0),
        due_reviews_count=1,
        weakest_skills=[],
        strongest_skills=[],
        last_lesson=None,
        wallet=WalletFacts(total=0, spend=0, save=0, donate=0),
        energy=EnergyFacts(current=5, regen_eta=0),
    )

    payload = facts.to_dict()

    assert payload["lastActiveAt"] == now.isoformat()


@pytest.mark.parametrize(
    ("mode", "expected_action"),
    [
        (NbaModeResolution(enabled=False, variant="CONTROL", reason="experiment_control", experiment_key="nba_retention_v1"), "control"),
        (NbaModeResolution(enabled=True, variant="VARIANT_A", reason="experiment_variant", experiment_key="nba_retention_v1"), "OPEN_MICRO_MISSION"),
        (NbaModeResolution(enabled=False, variant=None, reason="plan_disabled", experiment_key=None), "control"),
        (NbaModeResolution(enabled=False, variant=None, reason="child_flag_disabled", experiment_key=None), "control"),
        (NbaModeResolution(enabled=True, variant=None, reason="default", experiment_key=None), "OPEN_MICRO_MISSION"),
    ],
)
def test_brief_persists_mode_and_returns_reason(
    monkeypatch: pytest.MonkeyPatch,
    mode: NbaModeResolution,
    expected_action: str,
) -> None:
    from app.api.routes import axion as axion_route

    now = datetime.now(UTC)
    db = _FakeDBForBrief()
    events = _FakeEvents()

    monkeypatch.setattr(axion_route, "sync_outcome_metrics_for_user", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(axion_route, "_resolve_child_for_brief", lambda *_args, **_kwargs: 101)
    monkeypatch.setattr(
        axion_route,
        "_resolve_tenant_plan",
        lambda *_args, **_kwargs: Plan(
            name="FREE",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_route, "axion_child_profile_snapshot", lambda *_args, **_kwargs: {"childId": 101})
    def _resolve_mode_stub(*_args, **_kwargs):
        decision = AxionDecision(
            user_id=20,
            tenant_id=10,
            child_id=101,
            context="child_tab",
            experiment_key=mode.experiment_key,
            variant=mode.variant,
            nba_enabled_final=mode.enabled,
            nba_reason=mode.reason,
            decisions=[],
            debug={},
        )
        db.add(decision)
        db.flush()
        mode.decision_id = getattr(decision, "id", None)
        return mode

    monkeypatch.setattr(axion_route, "resolve_nba_mode", _resolve_mode_stub)
    monkeypatch.setattr(axion_route, "build_axion_facts", lambda *_args, **_kwargs: _stub_facts(now))
    monkeypatch.setattr(axion_route, "computeAxionState", lambda *_args, **_kwargs: _stub_state(now))
    monkeypatch.setattr(
        axion_route,
        "generateAxionMessage",
        lambda *_args, **_kwargs: {"templateId": 1, "tone": "ENCOURAGE", "message": "msg"},
    )
    monkeypatch.setattr(axion_route, "enrich_axion_message", lambda *_args, **_kwargs: "msg")

    response = axion_route.get_axion_brief(
        db=db,
        events=events,
        tenant=SimpleNamespace(id=10),
        user=SimpleNamespace(id=20, email="child@example.com"),
        __=None,
        context="child_tab",
        childId=101,
        axionDebug=False,
    )

    assert response.actionType == expected_action
    assert response.correlation_id
    assert response.variant == mode.variant
    assert response.nba_reason == mode.reason
    assert response.nba_enabled_final is mode.enabled

    decisions = [item for item in db.added if item.__class__.__name__ == "AxionDecision"]
    assert decisions, "expected AxionDecision persisted"
    decision = decisions[-1]
    assert getattr(decision, "nba_enabled_final") is mode.enabled
    assert getattr(decision, "nba_reason") == mode.reason
    assert getattr(decision, "experiment_key") == mode.experiment_key
    assert getattr(decision, "variant") == mode.variant


def test_brief_does_not_write_decision_directly(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.routes import axion as axion_route

    now = datetime.now(UTC)
    db = _FakeDBForBrief()
    events = _FakeEvents()
    mode = NbaModeResolution(enabled=True, variant="VARIANT_A", reason="experiment_variant", experiment_key="nba_retention_v1")

    monkeypatch.setattr(axion_route, "sync_outcome_metrics_for_user", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(axion_route, "_resolve_child_for_brief", lambda *_args, **_kwargs: 101)
    monkeypatch.setattr(
        axion_route,
        "_resolve_tenant_plan",
        lambda *_args, **_kwargs: Plan(
            name="FREE",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_route, "axion_child_profile_snapshot", lambda *_args, **_kwargs: {"childId": 101})

    def _resolve_mode_stub(*_args, **_kwargs):
        decision = AxionDecision(
            user_id=20,
            tenant_id=10,
            child_id=101,
            context="child_tab",
            experiment_key=mode.experiment_key,
            variant=mode.variant,
            nba_enabled_final=mode.enabled,
            nba_reason=mode.reason,
            decisions=[],
            debug={},
        )
        db.add(decision)
        db.flush()
        mode.decision_id = getattr(decision, "id", None)
        return mode

    monkeypatch.setattr(axion_route, "resolve_nba_mode", _resolve_mode_stub)
    monkeypatch.setattr(axion_route, "build_axion_facts", lambda *_args, **_kwargs: _stub_facts(now))
    monkeypatch.setattr(axion_route, "computeAxionState", lambda *_args, **_kwargs: _stub_state(now))
    monkeypatch.setattr(
        axion_route,
        "generateAxionMessage",
        lambda *_args, **_kwargs: {"templateId": 1, "tone": "ENCOURAGE", "message": "msg"},
    )
    monkeypatch.setattr(axion_route, "enrich_axion_message", lambda *_args, **_kwargs: "msg")

    axion_route.get_axion_brief(
        db=db,
        events=events,
        tenant=SimpleNamespace(id=10),
        user=SimpleNamespace(id=20, email="child@example.com"),
        __=None,
        context="child_tab",
        childId=101,
        axionDebug=False,
    )

    decisions = [item for item in db.added if item.__class__.__name__ == "AxionDecision"]
    assert len(decisions) == 1


def test_only_one_decision_row_per_brief_request(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.routes import axion as axion_route

    now = datetime.now(UTC)
    db = _FakeDBForBrief()
    events = _FakeEvents()
    mode = NbaModeResolution(enabled=False, variant="CONTROL", reason="experiment_control", experiment_key="nba_retention_v1")

    monkeypatch.setattr(axion_route, "sync_outcome_metrics_for_user", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(axion_route, "_resolve_child_for_brief", lambda *_args, **_kwargs: 101)
    monkeypatch.setattr(
        axion_route,
        "_resolve_tenant_plan",
        lambda *_args, **_kwargs: Plan(
            name="FREE",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_route, "axion_child_profile_snapshot", lambda *_args, **_kwargs: {"childId": 101})

    def _resolve_mode_stub(*_args, **_kwargs):
        decision = AxionDecision(
            user_id=20,
            tenant_id=10,
            child_id=101,
            context="child_tab",
            experiment_key=mode.experiment_key,
            variant=mode.variant,
            nba_enabled_final=mode.enabled,
            nba_reason=mode.reason,
            decisions=[],
            debug={},
        )
        db.add(decision)
        db.flush()
        mode.decision_id = getattr(decision, "id", None)
        return mode

    monkeypatch.setattr(axion_route, "resolve_nba_mode", _resolve_mode_stub)
    monkeypatch.setattr(axion_route, "build_axion_facts", lambda *_args, **_kwargs: _stub_facts(now))
    monkeypatch.setattr(axion_route, "computeAxionState", lambda *_args, **_kwargs: _stub_state(now))
    monkeypatch.setattr(axion_route, "generateAxionMessage", lambda *_args, **_kwargs: {"templateId": 0, "tone": "SUPPORT", "message": "msg"})
    monkeypatch.setattr(axion_route, "enrich_axion_message", lambda *_args, **_kwargs: "msg")

    axion_route.get_axion_brief(
        db=db,
        events=events,
        tenant=SimpleNamespace(id=10),
        user=SimpleNamespace(id=20, email="child@example.com"),
        __=None,
        context="child_tab",
        childId=101,
        axionDebug=False,
    )

    decisions = [item for item in db.added if item.__class__.__name__ == "AxionDecision"]
    assert len(decisions) == 1


def test_idempotent_decision_on_same_correlation_id(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDBForBrief()
    correlation_id = "11111111-1111-1111-1111-111111111111"

    monkeypatch.setattr(axion_mode, "resolve_nba_variant_for_experiment", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    first = axion_mode.resolve_nba_mode(
        db,
        tenant_id=1,
        child_id=10,
        user_id=20,
        context="child_tab",
        correlation_id=correlation_id,
    )
    first_decision = next(item for item in db.added if item.__class__.__name__ == "AxionDecision")
    monkeypatch.setattr(
        axion_mode,
        "_find_existing_decision_by_correlation",
        lambda *_args, **_kwargs: first_decision,
    )

    second = axion_mode.resolve_nba_mode(
        db,
        tenant_id=1,
        child_id=10,
        user_id=20,
        context="child_tab",
        correlation_id=correlation_id,
    )

    decisions = [item for item in db.added if item.__class__.__name__ == "AxionDecision"]
    assert len(decisions) == 1
    assert first.decision_id == second.decision_id
    assert second.correlation_id == correlation_id


def test_unique_constraint_prevents_duplicate_decisions() -> None:
    indexes = [
        idx
        for idx in AxionDecision.__table__.indexes
        if idx.name == "uq_axion_decisions_tenant_correlation_id"
    ]
    assert len(indexes) == 1
    index = indexes[0]
    assert index.unique is True
    assert [column.name for column in index.columns] == ["tenant_id", "correlation_id"]


def test_policy_decision_requires_policy_version() -> None:
    db = _FakeDBWithAdd()
    mode = NbaModeResolution(
        enabled=True,
        variant="VARIANT_A",
        reason="experiment_variant",
        experiment_key="nba_retention_v1",
        policy_applied=True,
        policy_state="ACTIVE",
        policy_version=None,
        selected_variant="VARIANT_A",
        exploration_flag=True,
    )

    axion_mode._persist_mode_decision(
        db,
        tenant_id=1,
        user_id=20,
        child_id=10,
        context="child_tab",
        mode=mode,
    )

    rows = [item for item in db.added if item.__class__.__name__ == "AxionDecision"]
    assert len(rows) == 1
    row = rows[0]
    assert row.decision_mode == "level4"
    assert row.policy_version is None
    assert row.exploration_flag is False


def test_shadow_cannot_write_policy_decision() -> None:
    db = _FakeDBWithAdd()
    mode = NbaModeResolution(
        enabled=True,
        variant="VARIANT_A",
        reason="experiment_variant",
        experiment_key="nba_retention_v1",
        policy_applied=True,
        policy_state="SHADOW",
        policy_version=7,
        selected_variant="VARIANT_A",
        exploration_flag=True,
    )

    axion_mode._persist_mode_decision(
        db,
        tenant_id=1,
        user_id=20,
        child_id=10,
        context="child_tab",
        mode=mode,
    )

    rows = [item for item in db.added if item.__class__.__name__ == "AxionDecision"]
    assert len(rows) == 1
    row = rows[0]
    assert row.decision_mode == "level4"
    assert row.policy_state == "SHADOW"
    assert row.policy_version is None


def test_brief_contract_single_canonical_decision_row(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.routes import axion as axion_route

    now = datetime.now(UTC)
    db = _FakeDBForBrief()
    events = _FakeEvents()

    def _setup_common_route_mocks() -> None:
        monkeypatch.setattr(axion_route, "sync_outcome_metrics_for_user", lambda *_args, **_kwargs: None)
        monkeypatch.setattr(
            axion_route,
            "_resolve_tenant_plan",
            lambda *_args, **_kwargs: Plan(
                name="PRO",
                llm_daily_budget=0,
                llm_monthly_budget=0,
                nba_enabled=True,
                advanced_personalization_enabled=True,
            ),
        )
        monkeypatch.setattr(axion_route, "axion_child_profile_snapshot", lambda *_args, **_kwargs: {"childId": 101})
        monkeypatch.setattr(axion_route, "build_axion_facts", lambda *_args, **_kwargs: _stub_facts(now))
        monkeypatch.setattr(axion_route, "computeAxionState", lambda *_args, **_kwargs: _stub_state(now))
        monkeypatch.setattr(
            axion_route,
            "generateAxionMessage",
            lambda *_args, **_kwargs: {"templateId": 1, "tone": "ENCOURAGE", "message": "msg"},
        )
        monkeypatch.setattr(axion_route, "enrich_axion_message", lambda *_args, **_kwargs: "msg")
        monkeypatch.setattr(
            axion_route,
            "select_next_best_action",
            lambda *_args, **_kwargs: AxionOrchestratorDecision(
                decision_id="",
                action_type="OFFER_MICRO_MISSION",
                context="child_tab",
                priority=1,
                cooldown_until=None,
                source="test",
                params={"missionId": "m1"},
                state=_stub_state(now),
                facts=_stub_facts(now),
                matched_rules=[],
            ),
        )

    _setup_common_route_mocks()

    monkeypatch.setattr(
        axion_mode,
        "resolve_nba_variant_for_experiment",
        lambda *_args, **_kwargs: SimpleNamespace(experiment_id="nba_retention_v1", variant="VARIANT_A"),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda *_args, **_kwargs: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=True,
        ),
    )
    monkeypatch.setattr(axion_mode.settings, "experiment_can_override_plan", True)
    monkeypatch.setattr(axion_mode.settings, "app_env", "staging")
    monkeypatch.setattr(axion_mode, "_latest_policy_version", lambda *_args, **_kwargs: 42)
    monkeypatch.setattr(axion_mode, "_apply_epsilon_greedy_variant", lambda *_args, **_kwargs: ("VARIANT_B", False))
    serving_state = {"state": "SHADOW"}

    def _resolve_serving_state_stub(*_args, child_id: int | None, **_kwargs):
        state = str(serving_state["state"]).upper()
        if state == "CANARY":
            subject = f"10:{child_id}" if child_id is not None else ""
            allowed = axion_mode._is_within_rollout_for_percent(subject, 5) if child_id is not None else False
            return axion_mode.PolicyServingDecision(state="CANARY", allow_policy_serving=allowed, reason="policy_canary_serving")
        if state == "ROLLED_BACK":
            return axion_mode.PolicyServingDecision(state="ROLLED_BACK", allow_policy_serving=False, reason="policy_rolled_back")
        if state == "ACTIVE":
            return axion_mode.PolicyServingDecision(state="ACTIVE", allow_policy_serving=True, reason="policy_active_serving")
        return axion_mode.PolicyServingDecision(state="SHADOW", allow_policy_serving=False, reason="policy_shadow_block")

    monkeypatch.setattr(axion_mode, "_resolve_policy_serving_state", _resolve_serving_state_stub)

    # Let resolve_nba_mode be idempotent in this fake DB by scanning already added decisions.
    def _find_existing_by_correlation(_db, *, tenant_id: int, correlation_id: str | None):
        token = str(correlation_id or "").strip()
        if not token:
            return None
        for item in db.added:
            if item.__class__.__name__ != "AxionDecision":
                continue
            if int(getattr(item, "tenant_id", 0) or 0) == int(tenant_id) and str(getattr(item, "correlation_id", "")) == token:
                return item
        return None

    monkeypatch.setattr(axion_mode, "_find_existing_decision_by_correlation", _find_existing_by_correlation)

    # Scenario 1: SHADOW -> always level4, policy_version NULL
    serving_state["state"] = "SHADOW"
    monkeypatch.setattr(axion_route, "_resolve_child_for_brief", lambda *_args, **_kwargs: 101)
    before_shadow = len([x for x in db.added if x.__class__.__name__ == "AxionDecision"])
    shadow_resp = axion_route.get_axion_brief(
        db=db,
        events=events,
        tenant=SimpleNamespace(id=10),
        user=SimpleNamespace(id=20, email="child@example.com"),
        __=None,
        context="child_tab",
        childId=101,
        correlationId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        axionDebug=False,
    )
    shadow_rows = [x for x in db.added if x.__class__.__name__ == "AxionDecision"]
    assert len(shadow_rows) == before_shadow + 1
    shadow_row = shadow_rows[-1]
    assert shadow_resp.decision_id == shadow_row.id
    assert shadow_row.correlation_id is not None
    assert shadow_row.decision_mode == "level4"
    assert shadow_row.policy_state == "SHADOW"
    assert shadow_row.policy_version is None

    # Scenario 2: CANARY -> some policy decisions with non-null policy_version
    serving_state["state"] = "CANARY"
    monkeypatch.setattr(
        axion_mode,
        "_is_within_rollout_for_percent",
        lambda subject, percent: (percent == 5 and int(str(subject).split(":")[-1]) % 20 == 0),
    )
    canary_start = len([x for x in db.added if x.__class__.__name__ == "AxionDecision"])
    for child_id in range(1, 41):
        monkeypatch.setattr(axion_route, "_resolve_child_for_brief", lambda *_args, **_kwargs: child_id)
        axion_route.get_axion_brief(
            db=db,
            events=events,
            tenant=SimpleNamespace(id=10),
            user=SimpleNamespace(id=2000 + child_id, email="child@example.com"),
            __=None,
            context="child_tab",
            childId=child_id,
            correlationId=f"00000000-0000-4000-8000-{child_id:012d}",
            axionDebug=False,
        )
    canary_rows = [x for x in db.added if x.__class__.__name__ == "AxionDecision"][canary_start:]
    assert len(canary_rows) == 40
    canary_policy_rows = [x for x in canary_rows if x.decision_mode == "policy"]
    assert len(canary_policy_rows) > 0
    assert all(x.policy_state == "CANARY" for x in canary_policy_rows)
    assert all(x.policy_version is not None for x in canary_policy_rows)

    # Scenario 3: ROLLED_BACK -> never policy
    serving_state["state"] = "ROLLED_BACK"
    monkeypatch.setattr(axion_route, "_resolve_child_for_brief", lambda *_args, **_kwargs: 777)
    before_rb = len([x for x in db.added if x.__class__.__name__ == "AxionDecision"])
    rb_resp = axion_route.get_axion_brief(
        db=db,
        events=events,
        tenant=SimpleNamespace(id=10),
        user=SimpleNamespace(id=999, email="child@example.com"),
        __=None,
        context="child_tab",
        childId=777,
        correlationId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        axionDebug=False,
    )
    rb_rows = [x for x in db.added if x.__class__.__name__ == "AxionDecision"]
    assert len(rb_rows) == before_rb + 1
    rb_row = rb_rows[-1]
    assert rb_resp.decision_id == rb_row.id
    assert rb_row.correlation_id is not None
    assert rb_row.policy_state == "ROLLED_BACK"
    assert rb_row.decision_mode == "level4"
    assert rb_row.policy_version is None

    # Replay with same correlation_id -> no new decision row and same decision_id
    before_replay = len([x for x in db.added if x.__class__.__name__ == "AxionDecision"])
    replay_resp = axion_route.get_axion_brief(
        db=db,
        events=events,
        tenant=SimpleNamespace(id=10),
        user=SimpleNamespace(id=999, email="child@example.com"),
        __=None,
        context="child_tab",
        childId=777,
        correlationId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        axionDebug=False,
    )
    after_replay = len([x for x in db.added if x.__class__.__name__ == "AxionDecision"])
    assert after_replay == before_replay
    assert replay_resp.decision_id == rb_resp.decision_id


def test_no_axiondecision_writers_outside_axion_mode() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    python_roots = [repo_root / "app", repo_root / "alembic" / "versions"]
    constructor_pattern = re.compile(r"\bAxionDecision\s*\(")
    add_pattern = re.compile(r"db\.add\(\s*AxionDecision\s*\(")

    allow_constructor_paths = {
        "app/services/axion_mode.py",
        "app/models.py",
    }

    violations: list[str] = []
    for root in python_roots:
        for path in root.rglob("*.py"):
            rel = path.relative_to(repo_root).as_posix()
            text = path.read_text(encoding="utf-8")
            has_constructor = bool(constructor_pattern.search(text))
            has_db_add_constructor = bool(add_pattern.search(text))
            if not has_constructor and not has_db_add_constructor:
                continue
            if rel in allow_constructor_paths:
                continue
            if rel.startswith("alembic/versions/"):
                continue
            violations.append(rel)

    assert not violations, f"AxionDecision writer found outside canonical writer: {violations}"
