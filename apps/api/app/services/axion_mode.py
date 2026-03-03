from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
import hashlib
from time import perf_counter
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AxionContentCatalog, AxionDecision, AxionExperiment, AxionFeatureRegistry, AxionFeatureSnapshot, AxionShadowPolicyCandidate, EventLog, Plan, Tenant
from app.observability.axion_metrics import (
    safe_increment_decisions_total,
    safe_increment_errors_total,
    safe_increment_guardrails_block_total,
    safe_increment_guardrails_fallback_total,
    safe_increment_policy_serving_total,
    safe_observe_latency_seconds,
)
from app.services.axion_content_prerequisites import filter_candidates_by_prerequisites
from app.services.axion_content_repetition import filter_repeated_candidates
from app.services.axion_age_gating import filter_candidate_content_ids_by_age, resolve_child_age
from app.services.axion_safety_gating import filter_candidates_by_safety_tags
from app.services.axion_kill_switch import is_axion_kill_switch_enabled
from app.services.axion_policy_governance import (
    POLICY_STATE_ACTIVE,
    POLICY_STATE_CANARY,
    POLICY_STATE_ROLLED_BACK,
    POLICY_STATE_SHADOW,
    get_current_policy_rollout_percentage,
    get_current_policy_state,
)
from app.services.axion_experiments import resolve_nba_variant_for_experiment
from app.services.axion_flags import is_nba_enabled

NBA_RETENTION_EXPERIMENT_KEY = "nba_retention_v1"
NBA_REASON_EXPERIMENT_CONTROL = "experiment_control"
NBA_REASON_EXPERIMENT_VARIANT = "experiment_variant"
NBA_REASON_PLAN_DISABLED = "plan_disabled"
NBA_REASON_CHILD_FLAG_DISABLED = "child_flag_disabled"
NBA_REASON_PRODUCTION_ROLLOUT_GUARD = "production_rollout_guard"
NBA_REASON_KILL_SWITCH_ENABLED = "kill_switch_enabled"
NBA_REASON_AGE_GATING_BLOCKED = "age_gating_blocked"
NBA_REASON_SAFETY_TAGS_BLOCKED = "safety_tags_blocked"
NBA_REASON_CONTENT_REPEAT_BLOCKED = "content_repeat_blocked"
NBA_REASON_PREREQUISITE_BLOCKED = "prerequisite_blocked"
NBA_REASON_GUARDRAILS_FALLBACK = "guardrails_fallback"
NBA_REASON_RAW_CANDIDATE_REGRESSION = "raw_candidate_usage_after_filter"
NBA_REASON_DEFAULT = "default"


@dataclass(slots=True)
class NbaModeResolution:
    enabled: bool
    variant: str | None
    reason: str
    experiment_key: str | None
    exploration_flag: bool = False
    selected_variant: str | None = None
    policy_version: int | None = None
    policy_state: str | None = None
    policy_serving_reason: str | None = None
    policy_applied: bool = False
    decision_id: str | None = None
    correlation_id: str | None = None
    selected_content_id: int | None = None


@dataclass(slots=True)
class PolicyServingDecision:
    state: str
    allow_policy_serving: bool
    reason: str


@dataclass(slots=True)
class GuardrailsPipelineResult:
    candidate_ids: list[int]
    fallback_applied: bool
    blocked_reason: str | None = None


def _resolve_policy_serving_state(
    db: Session,
    *,
    tenant_id: int,
    child_id: int | None,
    experiment_key: str | None,
) -> PolicyServingDecision:
    key = str(experiment_key or "").strip()
    if not key or child_id is None:
        return PolicyServingDecision(
            state=POLICY_STATE_SHADOW,
            allow_policy_serving=False,
            reason="policy_shadow_block",
        )
    if not hasattr(db, "scalar"):
        return PolicyServingDecision(
            state=POLICY_STATE_SHADOW,
            allow_policy_serving=False,
            reason="policy_shadow_block",
        )
    current_state = get_current_policy_state(db, tenant_id=tenant_id, experiment_key=key)
    normalized_state = str(current_state or POLICY_STATE_SHADOW).strip().upper()
    subject = f"{int(tenant_id)}:{int(child_id)}"

    if normalized_state == POLICY_STATE_SHADOW:
        return PolicyServingDecision(
            state=POLICY_STATE_SHADOW,
            allow_policy_serving=False,
            reason="policy_shadow_block",
        )
    if normalized_state == POLICY_STATE_ROLLED_BACK:
        return PolicyServingDecision(
            state=POLICY_STATE_ROLLED_BACK,
            allow_policy_serving=False,
            reason="policy_rolled_back",
        )
    if normalized_state == POLICY_STATE_CANARY:
        configured_rollout = get_current_policy_rollout_percentage(db, tenant_id=tenant_id, experiment_key=key)
        rollout_percent = 5 if configured_rollout is None else configured_rollout
        return PolicyServingDecision(
            state=POLICY_STATE_CANARY,
            allow_policy_serving=_is_within_rollout_for_percent(subject, rollout_percent),
            reason="policy_canary_serving",
        )
    if normalized_state == POLICY_STATE_ACTIVE:
        configured_rollout = get_current_policy_rollout_percentage(db, tenant_id=tenant_id, experiment_key=key)
        rollout_percent = _resolve_rollout_percent(db, experiment_key=key) if configured_rollout is None else configured_rollout
        return PolicyServingDecision(
            state=POLICY_STATE_ACTIVE,
            allow_policy_serving=_is_within_rollout_for_percent(subject, rollout_percent),
            reason="policy_active_serving",
        )
    return PolicyServingDecision(
        state=POLICY_STATE_SHADOW,
        allow_policy_serving=False,
        reason="policy_shadow_block",
    )


def _resolve_plan(db: Session, *, tenant_id: int) -> Plan:
    plan_name = db.scalar(select(Tenant.plan_name).where(Tenant.id == tenant_id)) or "FREE"
    plan = db.scalar(select(Plan).where(Plan.name == str(plan_name)))
    if plan is not None:
        return plan
    fallback = db.scalar(select(Plan).where(Plan.name == "FREE"))
    if fallback is not None:
        return fallback
    return Plan(
        name="FREE",
        llm_daily_budget=0,
        llm_monthly_budget=0,
        nba_enabled=True,
        advanced_personalization_enabled=False,
    )


def _experiment_can_override_plan() -> bool:
    configured = settings.experiment_can_override_plan
    if configured is not None:
        return bool(configured)
    env = (settings.app_env or "").strip().lower()
    if env == "production":
        return False
    if env == "staging":
        return True
    return True


def _is_within_production_rollout(child_id: str) -> bool:
    rollout = int(settings.axion_production_rollout_percent or 0)
    return _is_within_rollout_for_percent(child_id, rollout)


def _resolve_rollout_percent(db: Session, *, experiment_key: str | None) -> int:
    fallback = max(0, min(100, int(settings.axion_production_rollout_percent or 0)))
    if not hasattr(db, "scalar"):
        return fallback
    key = (experiment_key or "").strip()
    if not key:
        return fallback
    percent = db.scalar(
        select(AxionExperiment.rollout_percent)
        .where(AxionExperiment.experiment_id == key)
        .order_by(AxionExperiment.rollout_percent.desc().nullslast())
        .limit(1)
    )
    if percent is None:
        return fallback
    return max(0, min(100, int(percent)))


def _rollout_bucket_for_subject(subject: str) -> int:
    digest = hashlib.sha256(subject.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def _is_within_rollout_for_percent(subject: str, rollout_percent: int) -> bool:
    normalized_subject = (subject or "").strip()
    if not normalized_subject:
        return False
    rollout = max(0, min(100, int(rollout_percent)))
    if rollout <= 0:
        return False
    if rollout >= 100:
        return True
    bucket = _rollout_bucket_for_subject(normalized_subject)
    return bucket < rollout


def _is_within_production_rollout_for_percent(child_id: str, rollout_percent: int) -> bool:
    # Backward-compatible alias used in tests and legacy callers.
    return _is_within_rollout_for_percent(child_id, rollout_percent)


def _is_canary_user(db: Session, *, child_id: int | None, experiment_key: str | None) -> bool:
    if child_id is None:
        return False
    rollout_percent = _resolve_rollout_percent(db, experiment_key=experiment_key)
    if rollout_percent <= 0 or rollout_percent > 5:
        return False
    return _is_within_rollout_for_percent(str(child_id), rollout_percent)


def _resolve_epsilon() -> float:
    try:
        value = float(settings.axion_epsilon)
    except Exception:
        value = 0.1
    return max(0.0, min(1.0, value))


def _hash_ratio(seed: str) -> float:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    bucket = int(digest[:8], 16)
    return float(bucket) / float(0xFFFFFFFF)


def _list_active_variants(db: Session, *, experiment_key: str) -> list[str]:
    rows = db.scalars(
        select(AxionExperiment.variant)
        .where(
            AxionExperiment.experiment_id == experiment_key,
            AxionExperiment.active.is_(True),
            AxionExperiment.start_date <= date.today(),
            (AxionExperiment.end_date.is_(None) | (AxionExperiment.end_date >= date.today())),
        )
        .order_by(AxionExperiment.variant.asc())
    ).all()
    return [str(item).strip().upper() for item in rows if str(item).strip()]


def _best_policy_variant(db: Session, *, experiment_key: str) -> str | None:
    winner = db.scalar(
        select(AxionExperiment.experiment_winner_variant)
        .where(AxionExperiment.experiment_id == experiment_key, AxionExperiment.experiment_winner_variant.is_not(None))
        .order_by(AxionExperiment.start_date.desc())
        .limit(1)
    )
    normalized = str(winner or "").strip().upper()
    return normalized or None


def _latest_policy_version(db: Session, *, experiment_key: str) -> int | None:
    value = db.scalar(
        select(AxionShadowPolicyCandidate.policy_version)
        .where(AxionShadowPolicyCandidate.experiment_key == experiment_key)
        .order_by(AxionShadowPolicyCandidate.policy_version.desc())
        .limit(1)
    )
    if value is None:
        return None
    return int(value)


def _apply_epsilon_greedy_variant(
    db: Session,
    *,
    child_id: int,
    experiment_key: str,
    default_variant: str,
    candidate_content_ids: list[int] | None = None,
) -> tuple[str, bool]:
    active = [item for item in _list_active_variants(db, experiment_key=experiment_key) if item != "CONTROL"]
    if not active:
        return (default_variant, False)
    epsilon = _resolve_epsilon()
    explore_score = _hash_ratio(f"{experiment_key}:{child_id}:explore")
    if explore_score < epsilon:
        idx_score = _hash_ratio(f"{experiment_key}:{child_id}:explore_variant")
        idx = int(idx_score * len(active))
        idx = max(0, min(len(active) - 1, idx))
        return (active[idx], True)
    best = _best_policy_variant(db, experiment_key=experiment_key)
    if best and best in active:
        return (best, False)
    return (default_variant, False)


def _select_candidate_from_filtered_pool(
    *,
    tenant_id: int,
    child_id: int | None,
    correlation_id: str,
    candidates_filtered: list[int],
) -> int | None:
    if len(candidates_filtered) == 0:
        return None
    ordered = sorted(int(item) for item in candidates_filtered)
    seed = f"{tenant_id}:{child_id}:{correlation_id}:candidate"
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    idx = int(digest[:8], 16) % len(ordered)
    return int(ordered[idx])


def _guard_selection_uses_filtered_candidates(
    *,
    raw_candidates: list[int],
    candidates_filtered: list[int],
    selected_candidates: list[int],
) -> None:
    if len(raw_candidates) == 0 or len(selected_candidates) == 0:
        return
    filtered_set = {int(item) for item in candidates_filtered}
    selected_set = {int(item) for item in selected_candidates}
    if selected_set.issubset(filtered_set):
        return
    env = (settings.app_env or "").strip().lower()
    if env in {"development", "dev", "local"}:
        raise AssertionError("raw candidates used after guardrails filtering")
    safe_increment_guardrails_block_total(NBA_REASON_RAW_CANDIDATE_REGRESSION)


def _record_decision_latency_metric(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    child_id: int | None,
    experiment_key: str | None,
    start_time: datetime,
    end_time: datetime,
) -> None:
    if not hasattr(db, "add"):
        return
    duration_ms = max(0, int((end_time - start_time).total_seconds() * 1000))
    db.add(
        EventLog(
            tenant_id=tenant_id,
            actor_user_id=user_id,
            child_id=child_id,
            type="axion_decision_latency_ms",
            payload={
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "duration_ms": duration_ms,
                "environment": (settings.app_env or "").strip().lower() or "unknown",
                "experiment_key": experiment_key,
            },
        )
    )


def _record_feature_snapshot(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    child_id: int | None,
    context: str,
    mode: NbaModeResolution,
    feature_version: int,
) -> None:
    if not hasattr(db, "add"):
        return
    db.add(
        AxionFeatureSnapshot(
            user_id=user_id,
            tenant_id=tenant_id,
            experiment_key=mode.experiment_key,
            variant=mode.variant,
            feature_version=feature_version,
            features_json={
                "context": context,
                "child_id": child_id,
                "nba_enabled_final": bool(mode.enabled),
                "nba_reason": mode.reason,
                "exploration_flag": bool(mode.exploration_flag),
                "selected_variant": mode.selected_variant,
                "policy_version": mode.policy_version,
                "policy_state": mode.policy_state,
                "policy_serving_reason": mode.policy_serving_reason,
                "environment": (settings.app_env or "").strip().lower() or "unknown",
            },
            snapshot_at=datetime.now(UTC),
        )
    )


def _record_kill_switch_triggered_event(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    child_id: int | None,
    context: str,
    correlation_id: str,
) -> None:
    if not hasattr(db, "add"):
        return
    db.add(
        EventLog(
            tenant_id=tenant_id,
            actor_user_id=user_id,
            child_id=child_id,
            type="axion_kill_switch_triggered",
            payload={
                "timestamp": datetime.now(UTC).isoformat(),
                "context": context,
                "correlation_id": correlation_id,
                "kill_switch_enabled": True,
            },
        )
    )


def _record_guardrails_fallback_event(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    child_id: int | None,
    context: str,
    correlation_id: str,
    child_age: int | None,
    blocked_reason: str,
    fallback_candidate_ids: list[int],
    fallback_source: str,
) -> None:
    if not hasattr(db, "add"):
        return
    db.add(
        EventLog(
            tenant_id=tenant_id,
            actor_user_id=user_id,
            child_id=child_id,
            type="axion_guardrails_fallback",
            payload={
                "timestamp": datetime.now(UTC).isoformat(),
                "context": context,
                "correlation_id": correlation_id,
                "child_age": child_age,
                "blocked_reason": blocked_reason,
                "fallback_candidate_ids": [int(item) for item in fallback_candidate_ids],
                "fallback_source": fallback_source,
            },
        )
    )


def _record_guardrails_fallback_critical_event(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    child_id: int | None,
    context: str,
    correlation_id: str,
    child_age: int | None,
    blocked_reason: str,
) -> None:
    if not hasattr(db, "add"):
        return
    db.add(
        EventLog(
            tenant_id=tenant_id,
            actor_user_id=user_id,
            child_id=child_id,
            type="axion_guardrails_fallback_critical",
            payload={
                "timestamp": datetime.now(UTC).isoformat(),
                "context": context,
                "correlation_id": correlation_id,
                "child_age": child_age,
                "blocked_reason": blocked_reason,
                "fallback_source": "noop",
            },
        )
    )


def _build_candidates(*, candidate_content_ids: list[int] | None) -> list[int]:
    return [int(item) for item in list(candidate_content_ids or []) if item is not None]


_SAFE_NOOP_CONTENT_BY_BUCKET: dict[str, int] = {
    "lt10": 990031,
    "10_12": 990032,
    "13_15": 990033,
    "16_18": 990034,
}


def _age_bucket(age: int) -> str:
    if age < 10:
        return "lt10"
    if age <= 12:
        return "10_12"
    if age <= 15:
        return "13_15"
    return "16_18"


def _safe_noop_candidate(child_age: int) -> list[int]:
    return [_SAFE_NOOP_CONTENT_BY_BUCKET[_age_bucket(int(child_age))]]


def _safe_default_candidates(
    db: Session,
    *,
    child_age: int,
) -> tuple[list[int], str]:
    if not hasattr(db, "scalars"):
        return (_safe_noop_candidate(child_age), "noop")

    # Layer A: neutral/general for the age bucket.
    neutral_rows = db.scalars(
        select(AxionContentCatalog.content_id).where(
            AxionContentCatalog.is_active.is_(True),
            AxionContentCatalog.subject.in_(["neutral", "general"]),
            AxionContentCatalog.age_min <= int(child_age),
            AxionContentCatalog.age_max >= int(child_age),
        )
        .order_by(AxionContentCatalog.content_id.asc())
        .limit(5)
    ).all()
    neutral_ids = [int(item) for item in neutral_rows]
    if len(neutral_ids) > 0:
        return (neutral_ids, "neutral_general")

    # Layer B: any age-eligible content that is safe for age policy.
    age_rows = db.scalars(
        select(AxionContentCatalog.content_id).where(
            AxionContentCatalog.is_active.is_(True),
            AxionContentCatalog.age_min <= int(child_age),
            AxionContentCatalog.age_max >= int(child_age),
        )
        .order_by(AxionContentCatalog.content_id.asc())
        .limit(100)
    ).all()
    age_ids = [int(item) for item in age_rows]
    if len(age_ids) > 0:
        safe_ids = filter_candidates_by_safety_tags(
            db,
            candidate_content_ids=age_ids,
            child_age=int(child_age),
        )
        if len(safe_ids) > 0:
            return (safe_ids[:5], "age_safe")

    # Layer C: hardcoded safe noop candidate, guaranteed non-empty.
    return (_safe_noop_candidate(child_age), "noop")


def _apply_guardrails_pipeline(
    db: Session,
    *,
    tenant_id: int,
    child_id: int | None,
    user_id: int,
    context: str,
    correlation_id: str,
    child_age: int | None,
    candidate_content_ids: list[int],
    content_mode: str | None,
) -> GuardrailsPipelineResult:
    if len(candidate_content_ids) == 0:
        return GuardrailsPipelineResult(candidate_ids=[], fallback_applied=False, blocked_reason=None)

    resolved_age = resolve_child_age(db, child_id=child_id)
    if resolved_age is None:
        safe_increment_guardrails_block_total(NBA_REASON_AGE_GATING_BLOCKED)
        return GuardrailsPipelineResult(candidate_ids=[], fallback_applied=False, blocked_reason=NBA_REASON_AGE_GATING_BLOCKED)

    # Guardrail order is strict: age -> safety -> prerequisites -> anti-dup.
    age_eligible_ids = filter_candidate_content_ids_by_age(
        db,
        candidate_content_ids=candidate_content_ids,
        child_age=resolved_age,
    )
    if len(age_eligible_ids) == 0:
        safe_increment_guardrails_block_total(NBA_REASON_AGE_GATING_BLOCKED)
        fallback, fallback_source = _safe_default_candidates(db, child_age=resolved_age)
        if len(fallback) == 0:
            return GuardrailsPipelineResult(candidate_ids=[], fallback_applied=False, blocked_reason=NBA_REASON_AGE_GATING_BLOCKED)
        safe_increment_guardrails_fallback_total()
        _record_guardrails_fallback_event(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            child_id=child_id,
            context=context,
            correlation_id=correlation_id,
            child_age=resolved_age,
            blocked_reason=NBA_REASON_AGE_GATING_BLOCKED,
            fallback_candidate_ids=fallback,
            fallback_source=fallback_source,
        )
        if fallback_source == "noop":
            _record_guardrails_fallback_critical_event(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                child_id=child_id,
                context=context,
                correlation_id=correlation_id,
                child_age=resolved_age,
                blocked_reason=NBA_REASON_AGE_GATING_BLOCKED,
            )
        return GuardrailsPipelineResult(candidate_ids=fallback, fallback_applied=True, blocked_reason=NBA_REASON_AGE_GATING_BLOCKED)

    safety_eligible_ids = filter_candidates_by_safety_tags(
        db,
        candidate_content_ids=age_eligible_ids,
        child_age=resolved_age,
    )
    if len(safety_eligible_ids) == 0:
        safe_increment_guardrails_block_total(NBA_REASON_SAFETY_TAGS_BLOCKED)
        fallback, fallback_source = _safe_default_candidates(db, child_age=resolved_age)
        if len(fallback) == 0:
            return GuardrailsPipelineResult(candidate_ids=[], fallback_applied=False, blocked_reason=NBA_REASON_SAFETY_TAGS_BLOCKED)
        safe_increment_guardrails_fallback_total()
        _record_guardrails_fallback_event(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            child_id=child_id,
            context=context,
            correlation_id=correlation_id,
            child_age=resolved_age,
            blocked_reason=NBA_REASON_SAFETY_TAGS_BLOCKED,
            fallback_candidate_ids=fallback,
            fallback_source=fallback_source,
        )
        if fallback_source == "noop":
            _record_guardrails_fallback_critical_event(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                child_id=child_id,
                context=context,
                correlation_id=correlation_id,
                child_age=resolved_age,
                blocked_reason=NBA_REASON_SAFETY_TAGS_BLOCKED,
            )
        return GuardrailsPipelineResult(candidate_ids=fallback, fallback_applied=True, blocked_reason=NBA_REASON_SAFETY_TAGS_BLOCKED)

    if child_id is None:
        safe_increment_guardrails_block_total(NBA_REASON_PREREQUISITE_BLOCKED)
        fallback, fallback_source = _safe_default_candidates(db, child_age=resolved_age)
        if len(fallback) == 0:
            return GuardrailsPipelineResult(candidate_ids=[], fallback_applied=False, blocked_reason=NBA_REASON_PREREQUISITE_BLOCKED)
        safe_increment_guardrails_fallback_total()
        _record_guardrails_fallback_event(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            child_id=child_id,
            context=context,
            correlation_id=correlation_id,
            child_age=resolved_age,
            blocked_reason=NBA_REASON_PREREQUISITE_BLOCKED,
            fallback_candidate_ids=fallback,
            fallback_source=fallback_source,
        )
        if fallback_source == "noop":
            _record_guardrails_fallback_critical_event(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                child_id=child_id,
                context=context,
                correlation_id=correlation_id,
                child_age=resolved_age,
                blocked_reason=NBA_REASON_PREREQUISITE_BLOCKED,
            )
        return GuardrailsPipelineResult(candidate_ids=fallback, fallback_applied=True, blocked_reason=NBA_REASON_PREREQUISITE_BLOCKED)

    prereq_eligible_ids = filter_candidates_by_prerequisites(
        db,
        tenant_id=tenant_id,
        child_id=int(child_id),
        candidate_content_ids=safety_eligible_ids,
    )
    if len(prereq_eligible_ids) == 0:
        safe_increment_guardrails_block_total(NBA_REASON_PREREQUISITE_BLOCKED)
        fallback, fallback_source = _safe_default_candidates(db, child_age=resolved_age)
        if len(fallback) == 0:
            return GuardrailsPipelineResult(candidate_ids=[], fallback_applied=False, blocked_reason=NBA_REASON_PREREQUISITE_BLOCKED)
        safe_increment_guardrails_fallback_total()
        _record_guardrails_fallback_event(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            child_id=child_id,
            context=context,
            correlation_id=correlation_id,
            child_age=resolved_age,
            blocked_reason=NBA_REASON_PREREQUISITE_BLOCKED,
            fallback_candidate_ids=fallback,
            fallback_source=fallback_source,
        )
        if fallback_source == "noop":
            _record_guardrails_fallback_critical_event(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                child_id=child_id,
                context=context,
                correlation_id=correlation_id,
                child_age=resolved_age,
                blocked_reason=NBA_REASON_PREREQUISITE_BLOCKED,
            )
        return GuardrailsPipelineResult(candidate_ids=fallback, fallback_applied=True, blocked_reason=NBA_REASON_PREREQUISITE_BLOCKED)

    non_repeated_ids = filter_repeated_candidates(
        db,
        tenant_id=tenant_id,
        child_id=int(child_id),
        candidate_content_ids=prereq_eligible_ids,
        mode=content_mode,
    )
    if len(non_repeated_ids) == 0:
        safe_increment_guardrails_block_total(NBA_REASON_CONTENT_REPEAT_BLOCKED)
        fallback, fallback_source = _safe_default_candidates(db, child_age=resolved_age)
        if len(fallback) == 0:
            return GuardrailsPipelineResult(candidate_ids=[], fallback_applied=False, blocked_reason=NBA_REASON_CONTENT_REPEAT_BLOCKED)
        safe_increment_guardrails_fallback_total()
        _record_guardrails_fallback_event(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            child_id=child_id,
            context=context,
            correlation_id=correlation_id,
            child_age=resolved_age,
            blocked_reason=NBA_REASON_CONTENT_REPEAT_BLOCKED,
            fallback_candidate_ids=fallback,
            fallback_source=fallback_source,
        )
        if fallback_source == "noop":
            _record_guardrails_fallback_critical_event(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                child_id=child_id,
                context=context,
                correlation_id=correlation_id,
                child_age=resolved_age,
                blocked_reason=NBA_REASON_CONTENT_REPEAT_BLOCKED,
            )
        return GuardrailsPipelineResult(candidate_ids=fallback, fallback_applied=True, blocked_reason=NBA_REASON_CONTENT_REPEAT_BLOCKED)

    return GuardrailsPipelineResult(candidate_ids=non_repeated_ids, fallback_applied=False, blocked_reason=None)


def _persist_mode_decision(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    child_id: int | None,
    context: str,
    mode: NbaModeResolution,
) -> None:
    if not hasattr(db, "add"):
        return
    normalized_policy_state = str(mode.policy_state or "").strip().upper() or None
    policy_mode = bool(
        mode.policy_applied
        and mode.policy_version is not None
        and normalized_policy_state in {POLICY_STATE_CANARY, POLICY_STATE_ACTIVE}
    )
    governance_reason = str(mode.policy_serving_reason or "").strip()
    reason_code = mode.reason
    if governance_reason in {"policy_shadow_block", "policy_rolled_back"}:
        reason_code = governance_reason
    decision_mode = "policy" if policy_mode else "level4"
    decision_row = AxionDecision(
            tenant_id=tenant_id,
            user_id=user_id,
            child_id=child_id,
            context=context,
            experiment_id=mode.experiment_key,
            experiment_key=mode.experiment_key,
            chosen_variant=mode.selected_variant,
            correlation_id=mode.correlation_id,
            variant=mode.selected_variant,
            decided_at=datetime.now(UTC),
            decision_mode=decision_mode,
            policy_state=normalized_policy_state,
            policy_version=(mode.policy_version if decision_mode == "policy" else None),
            exploration_flag=bool(mode.exploration_flag and decision_mode == "policy"),
            reason_code=reason_code,
            metadata_json={
                "policy_serving_reason": mode.policy_serving_reason,
                "nba_enabled_final": bool(mode.enabled),
                "correlation_id": mode.correlation_id,
                "selected_content_id": mode.selected_content_id,
            },
            nba_enabled_final=bool(mode.enabled),
            nba_reason=mode.reason,
            decisions=[],
            debug={},
        )
    db.add(decision_row)
    if hasattr(db, "flush"):
        db.flush()
    row_id = getattr(decision_row, "id", None)
    if row_id:
        mode.decision_id = str(row_id)


def _find_existing_decision_by_correlation(
    db: Session,
    *,
    tenant_id: int,
    correlation_id: str | None,
) -> AxionDecision | None:
    token = str(correlation_id or "").strip()
    if not token or not hasattr(db, "scalar"):
        return None
    return db.scalar(
        select(AxionDecision).where(
            AxionDecision.tenant_id == tenant_id,
            AxionDecision.correlation_id == token,
        )
    )


def _resolution_from_existing_decision(
    row: AxionDecision,
    *,
    correlation_id: str,
) -> NbaModeResolution:
    selected_variant = str(row.chosen_variant or row.variant or "").strip().upper() or None
    reason = str(row.nba_reason or row.reason_code or NBA_REASON_DEFAULT)
    return NbaModeResolution(
        enabled=bool(row.nba_enabled_final),
        variant=selected_variant,
        reason=reason,
        experiment_key=row.experiment_key,
        exploration_flag=bool(row.exploration_flag),
        selected_variant=selected_variant,
        policy_version=row.policy_version,
        policy_state=row.policy_state,
        policy_applied=str(row.decision_mode).strip().lower() == "policy",
        decision_id=str(row.id),
        correlation_id=correlation_id,
        selected_content_id=int((row.metadata_json or {}).get("selected_content_id")) if (row.metadata_json or {}).get("selected_content_id") is not None else None,
    )


def _resolve_active_feature_version(db: Session) -> int:
    if not hasattr(db, "scalar"):
        return 1
    active_version = db.scalar(
        select(AxionFeatureRegistry.version)
        .where(AxionFeatureRegistry.active.is_(True))
        .order_by(AxionFeatureRegistry.version.desc())
        .limit(1)
    )
    if active_version is None:
        return 1
    return max(1, int(active_version))


def resolve_nba_mode(
    db: Session,
    *,
    tenant_id: int,
    child_id: int | None,
    user_id: int,
    context: str,
    correlation_id: str | None = None,
    child_age: int | None = None,
    candidate_content_ids: list[int] | None = None,
    content_mode: str | None = None,
) -> NbaModeResolution:
    elapsed_start = perf_counter()
    start_time = datetime.now(UTC)
    raw_correlation_id = str(correlation_id or "").strip()
    try:
        kill_switch_enabled = is_axion_kill_switch_enabled()
        try:
            parsed_correlation_id = str(UUID(raw_correlation_id)) if raw_correlation_id else str(uuid4())
        except ValueError:
            parsed_correlation_id = str(uuid4())
        request_correlation_id = str(uuid4()) if kill_switch_enabled else parsed_correlation_id
        feature_version = _resolve_active_feature_version(db)

        def _finish(mode: NbaModeResolution) -> NbaModeResolution:
            if not mode.correlation_id:
                mode.correlation_id = request_correlation_id
            _persist_mode_decision(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                child_id=child_id,
                context=context,
                mode=mode,
            )
            _record_feature_snapshot(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                child_id=child_id,
                context=context,
                mode=mode,
                feature_version=feature_version,
            )
            _record_decision_latency_metric(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                child_id=child_id,
                experiment_key=mode.experiment_key,
                start_time=start_time,
                end_time=datetime.now(UTC),
            )
            safe_increment_decisions_total(str(mode.policy_state or "SHADOW"))
            if mode.policy_applied:
                safe_increment_policy_serving_total(mode.policy_version)
            return mode

        # Kill-switch has absolute precedence and must ignore idempotent replay.
        if kill_switch_enabled:
            _record_kill_switch_triggered_event(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                child_id=child_id,
                context=context,
                correlation_id=raw_correlation_id or request_correlation_id,
            )
            return _finish(NbaModeResolution(
                enabled=False,
                variant="CONTROL",
                reason=NBA_REASON_KILL_SWITCH_ENABLED,
                experiment_key=None,
                exploration_flag=False,
                selected_variant="CONTROL",
                policy_version=None,
                policy_state=POLICY_STATE_ROLLED_BACK,
                policy_serving_reason="policy_rolled_back",
                policy_applied=False,
            ))

        candidates_raw = _build_candidates(candidate_content_ids=candidate_content_ids)
        candidates_filtered: list[int] = list(candidates_raw)
        selected_content_id: int | None = None
        if len(candidates_raw) > 0:
            guardrails = _apply_guardrails_pipeline(
                db,
                tenant_id=tenant_id,
                child_id=child_id,
                user_id=user_id,
                context=context,
                correlation_id=request_correlation_id,
                child_age=child_age,
                candidate_content_ids=candidates_raw,
                content_mode=content_mode,
            )
            candidates_filtered = [int(item) for item in guardrails.candidate_ids]
            if len(candidates_filtered) == 0:
                return _finish(NbaModeResolution(
                    enabled=False,
                    variant="CONTROL",
                    reason=(NBA_REASON_GUARDRAILS_FALLBACK if guardrails.fallback_applied else str(guardrails.blocked_reason or NBA_REASON_GUARDRAILS_FALLBACK)),
                    experiment_key=None,
                    exploration_flag=False,
                    selected_variant="CONTROL",
                    policy_version=None,
                    policy_state=POLICY_STATE_ROLLED_BACK,
                    policy_serving_reason="policy_rolled_back",
                    policy_applied=False,
                    selected_content_id=None,
                ))
            selected_content_id = _select_candidate_from_filtered_pool(
                tenant_id=tenant_id,
                child_id=child_id,
                correlation_id=request_correlation_id,
                candidates_filtered=candidates_filtered,
            )
            _guard_selection_uses_filtered_candidates(
                raw_candidates=candidates_raw,
                candidates_filtered=candidates_filtered,
                selected_candidates=([selected_content_id] if selected_content_id is not None else []),
            )
        existing_decision = _find_existing_decision_by_correlation(
            db,
            tenant_id=tenant_id,
            correlation_id=request_correlation_id,
        )
        if existing_decision is not None:
            mode = _resolution_from_existing_decision(existing_decision, correlation_id=request_correlation_id)
            safe_increment_decisions_total(str(mode.policy_state or "SHADOW"))
            if mode.policy_applied:
                safe_increment_policy_serving_total(mode.policy_version)
            return mode

        assignment = resolve_nba_variant_for_experiment(db, experiment_id=NBA_RETENTION_EXPERIMENT_KEY, child_id=child_id)
        assigned_variant: str | None = None
        assigned_experiment_key: str | None = None
        exploration_flag = False
        selected_variant: str | None = None
        policy_version: int | None = None
        policy_state: str | None = None
        policy_serving_reason: str | None = None
        policy_applied = False
        if assignment is not None:
            assigned_variant = str(assignment.variant or "").strip().upper() or None
            assigned_experiment_key = assignment.experiment_id
            serving_decision = _resolve_policy_serving_state(
                db,
                tenant_id=tenant_id,
                child_id=child_id,
                experiment_key=assigned_experiment_key,
            )
            policy_state = serving_decision.state
            policy_serving_reason = serving_decision.reason
            env = (settings.app_env or "").strip().lower()
            if env == "production":
                rollout_child_id = f"{tenant_id}:{child_id}" if child_id is not None else ""
                rollout_percent = _resolve_rollout_percent(db, experiment_key=assigned_experiment_key)
                if not _is_within_rollout_for_percent(rollout_child_id, rollout_percent):
                    return _finish(NbaModeResolution(
                        enabled=False,
                        variant=assigned_variant,
                        reason=NBA_REASON_PRODUCTION_ROLLOUT_GUARD,
                        experiment_key=assigned_experiment_key,
                        policy_state=policy_state,
                        policy_serving_reason=policy_serving_reason,
                        policy_applied=policy_applied,
                    ))
            if assigned_variant is not None and assigned_experiment_key and assigned_variant != "CONTROL":
                if serving_decision.allow_policy_serving and serving_decision.state in {POLICY_STATE_CANARY, POLICY_STATE_ACTIVE}:
                    selected_variant, exploration_flag = _apply_epsilon_greedy_variant(
                        db,
                        child_id=int(child_id),
                        experiment_key=assigned_experiment_key,
                        default_variant=assigned_variant,
                        candidate_content_ids=candidates_filtered,
                    )
                    assigned_variant = selected_variant
                    policy_version = _latest_policy_version(db, experiment_key=assigned_experiment_key)
                    policy_applied = True
            if assigned_variant == "CONTROL":
                return _finish(NbaModeResolution(
                    enabled=False,
                    variant=assigned_variant,
                    reason=NBA_REASON_EXPERIMENT_CONTROL,
                    experiment_key=assignment.experiment_id,
                    exploration_flag=exploration_flag,
                    selected_variant=assigned_variant,
                    policy_version=policy_version,
                    policy_state=policy_state,
                    policy_serving_reason=policy_serving_reason,
                    policy_applied=policy_applied,
                    selected_content_id=selected_content_id,
                ))

        plan = _resolve_plan(db, tenant_id=tenant_id)
        can_override_plan = _experiment_can_override_plan()
        if assigned_variant is not None and can_override_plan:
            return _finish(NbaModeResolution(
                enabled=True,
                variant=assigned_variant,
                reason=NBA_REASON_EXPERIMENT_VARIANT,
                experiment_key=assigned_experiment_key,
                exploration_flag=exploration_flag,
                selected_variant=assigned_variant,
                policy_version=policy_version,
                policy_state=policy_state,
                policy_serving_reason=policy_serving_reason,
                policy_applied=policy_applied,
                selected_content_id=selected_content_id,
            ))
        if not bool(plan.nba_enabled):
            return _finish(NbaModeResolution(
                enabled=False,
                variant=assigned_variant,
                reason=NBA_REASON_PLAN_DISABLED,
                experiment_key=assigned_experiment_key,
                exploration_flag=exploration_flag,
                selected_variant=assigned_variant,
                policy_version=policy_version,
                policy_state=policy_state,
                policy_serving_reason=policy_serving_reason,
                policy_applied=policy_applied,
                selected_content_id=selected_content_id,
            ))
        if not is_nba_enabled(db, child_id=child_id):
            return _finish(NbaModeResolution(
                enabled=False,
                variant=assigned_variant,
                reason=NBA_REASON_CHILD_FLAG_DISABLED,
                experiment_key=assigned_experiment_key,
                exploration_flag=exploration_flag,
                selected_variant=assigned_variant,
                policy_version=policy_version,
                policy_state=policy_state,
                policy_serving_reason=policy_serving_reason,
                policy_applied=policy_applied,
                selected_content_id=selected_content_id,
            ))
        if assigned_variant is not None:
            return _finish(NbaModeResolution(
                enabled=True,
                variant=assigned_variant,
                reason=NBA_REASON_EXPERIMENT_VARIANT,
                experiment_key=assigned_experiment_key,
                exploration_flag=exploration_flag,
                selected_variant=assigned_variant,
                policy_version=policy_version,
                policy_state=policy_state,
                policy_serving_reason=policy_serving_reason,
                policy_applied=policy_applied,
                selected_content_id=selected_content_id,
            ))
        return _finish(NbaModeResolution(
            enabled=True,
            variant=None,
            reason=NBA_REASON_DEFAULT,
            experiment_key=None,
            exploration_flag=False,
            selected_variant=None,
            policy_version=None,
            selected_content_id=selected_content_id,
        ))
    except Exception as exc:
        safe_increment_errors_total(type(exc).__name__)
        raise
    finally:
        safe_observe_latency_seconds(perf_counter() - elapsed_start)
