from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
import logging
import math

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AuditLog, AxionDecision, AxionExperiment, EventLog, Membership
from app.services.axion_alerting import send_axion_operational_alert
from app.services.axion_retention import AxionRetentionFilters, get_axion_retention_metrics

logger = logging.getLogger(__name__)

EXPERIMENT_KEY_NBA_RETENTION_V1 = "nba_retention_v1"
ERROR_EVENT_TYPES = ("axion_brief_error", "axion_orchestrator_error", "axion_decision_invalid")
CRASH_EVENT_TYPES = ("axion_crash", "axion_brief_crash", "axion_orchestrator_crash")
EXPERIMENT_STATUS_ACTIVE = "ACTIVE"
EXPERIMENT_STATUS_PAUSED = "PAUSED"
EXPERIMENT_STATUS_AUTO_PAUSED = "AUTO_PAUSED"


@dataclass(slots=True)
class ExperimentHealthResult:
    experiment_key: str
    paused: bool
    reasons: list[str]
    metrics: dict[str, float | int]


@dataclass(slots=True)
class ExperimentWinnerResult:
    experiment_key: str
    winner_variant: str | None
    eligible: bool
    reason: str
    metrics: dict[str, float | int]


@dataclass(slots=True)
class ExperimentRolloutScaleResult:
    experiment_key: str
    scaled: bool
    previous_rollout_percent: int
    new_rollout_percent: int
    reason: str
    metrics: dict[str, float | int]


@dataclass(slots=True)
class ExperimentRolloutStatus:
    experiment_key: str
    current_rollout: int
    next_step: int | None
    days_since_last_change: int | None
    eligible_for_increase: bool
    reason: str


ROLLOUT_STEPS = (5, 10, 25, 50, 75, 100)


def _get_active_variants(db: Session, *, experiment_key: str) -> list[str]:
    return [
        str(item)
        for item in db.scalars(
            select(AxionExperiment.variant)
            .where(
                AxionExperiment.experiment_id == experiment_key,
                AxionExperiment.active.is_(True),
            )
            .order_by(AxionExperiment.variant.asc())
        ).all()
    ]


def lock_experiment_for_update(db: Session, *, experiment_key: str, skip_locked: bool = False) -> bool:
    if not hasattr(db, "execute"):
        return True
    rows = db.execute(
        select(AxionExperiment.variant)
        .where(AxionExperiment.experiment_id == experiment_key)
        .with_for_update(skip_locked=skip_locked)
    ).all()
    return len(rows) > 0


def _count_experiment_events(db: Session, *, experiment_key: str, event_types: tuple[str, ...]) -> int:
    row = db.execute(
        text(
            """
            SELECT COUNT(e.id)::int
            FROM event_log e
            JOIN axion_decisions d
              ON d.id = (e.payload->>'decision_id')::uuid
            WHERE d.experiment_key = :experiment_key
              AND e.type = ANY(:event_types)
            """
        ),
        {"experiment_key": experiment_key, "event_types": list(event_types)},
    ).scalar_one_or_none()
    return int(row or 0)


def _count_invalid_decisions(db: Session, *, experiment_key: str) -> int:
    return int(
        db.scalar(
            select(func.count(AxionDecision.id)).where(
                AxionDecision.experiment_key == experiment_key,
                AxionDecision.variant.is_not(None),
                AxionDecision.variant != "CONTROL",
                (
                    (AxionDecision.action_type.is_(None))
                    | (func.lower(AxionDecision.action_type) == "control")
                    | (AxionDecision.tenant_id.is_(None))
                    | (AxionDecision.child_id.is_(None))
                ),
            )
        )
        or 0
    )


def _resolve_audit_context(db: Session, *, tenant_id: int | None, actor_user_id: int | None) -> tuple[int | None, int | None]:
    resolved_tenant_id = tenant_id
    resolved_actor_user_id = actor_user_id
    if resolved_actor_user_id is None and resolved_tenant_id is not None:
        resolved_actor_user_id = db.scalar(
            select(Membership.user_id).where(Membership.tenant_id == resolved_tenant_id).order_by(Membership.user_id.asc()).limit(1)
        )
    if resolved_tenant_id is None and resolved_actor_user_id is not None:
        resolved_tenant_id = db.scalar(
            select(Membership.tenant_id).where(Membership.user_id == resolved_actor_user_id).order_by(Membership.tenant_id.asc()).limit(1)
        )
    return (int(resolved_tenant_id) if resolved_tenant_id is not None else None, int(resolved_actor_user_id) if resolved_actor_user_id is not None else None)


def _deactivate_experiment(
    db: Session,
    *,
    experiment_key: str,
    status_value: str = EXPERIMENT_STATUS_AUTO_PAUSED,
) -> int:
    result = db.execute(
        update(AxionExperiment)
        .where(
            AxionExperiment.experiment_id == experiment_key,
            AxionExperiment.active.is_(True),
        )
        .values(active=False, experiment_status=status_value)
    )
    return int(result.rowcount or 0)


def _set_winner_variant(db: Session, *, experiment_key: str, winner_variant: str | None) -> int:
    result = db.execute(
        update(AxionExperiment)
        .where(AxionExperiment.experiment_id == experiment_key)
        .values(experiment_winner_variant=winner_variant)
    )
    return int(result.rowcount or 0)


def _write_auto_pause_audit(
    db: Session,
    *,
    experiment_key: str,
    tenant_id: int | None,
    actor_user_id: int | None,
    reasons: list[str],
    metrics: dict[str, float | int],
) -> None:
    if tenant_id is None or actor_user_id is None:
        return
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="NBA_EXPERIMENT_AUTO_PAUSED",
            entity_type="axion_experiment",
            entity_id=0,
            metadata_json={
                "message": "NBA experiment auto-paused",
                "experiment_key": experiment_key,
                "timestamp": datetime.now(UTC).isoformat(),
                "reasons": reasons,
                "metrics": metrics,
            },
        )
    )


def _write_winner_audit(
    db: Session,
    *,
    experiment_key: str,
    winner_variant: str,
    tenant_id: int | None,
    actor_user_id: int | None,
    metrics: dict[str, float | int],
) -> None:
    if tenant_id is None or actor_user_id is None:
        return
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="NBA_EXPERIMENT_WINNER_MARKED",
            entity_type="axion_experiment",
            entity_id=0,
            metadata_json={
                "message": "NBA experiment winner marked",
                "experiment_key": experiment_key,
                "winner_variant": winner_variant,
                "timestamp": datetime.now(UTC).isoformat(),
                "metrics": metrics,
            },
        )
    )


def _write_stat_sig_event(
    db: Session,
    *,
    experiment_key: str,
    tenant_id: int | None,
    actor_user_id: int | None,
    variant: str,
    pvalue: float,
    uplift: float,
    control_rate: float,
    variant_rate: float,
) -> None:
    if tenant_id is None or not hasattr(db, "add"):
        return
    db.add(
        EventLog(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            child_id=None,
            type="experiment_stat_sig_reached",
            payload={
                "experiment_key": experiment_key,
                "variant": variant,
                "p_value": round(pvalue, 6),
                "uplift": round(uplift, 6),
                "direction": "negative" if uplift < 0 else "positive",
                "control_rate": round(control_rate, 6),
                "variant_rate": round(variant_rate, 6),
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )
    )
    send_axion_operational_alert(
        event_type="experiment_stat_sig_reached",
        experiment_key=experiment_key,
        metric_snapshot={
            "variant": variant,
            "p_value_adjusted": round(pvalue, 6),
            "uplift": round(uplift, 6),
            "control_rate": round(control_rate, 6),
            "variant_rate": round(variant_rate, 6),
        },
        severity="warning",
    )


def _write_rollout_scaled_audit(
    db: Session,
    *,
    experiment_key: str,
    tenant_id: int | None,
    actor_user_id: int | None,
    previous_rollout_percent: int,
    new_rollout_percent: int,
    metrics: dict[str, float | int],
) -> None:
    if tenant_id is None or actor_user_id is None:
        return
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="NBA_EXPERIMENT_ROLLOUT_SCALED",
            entity_type="axion_experiment",
            entity_id=0,
            metadata_json={
                "message": "NBA experiment rollout scaled",
                "experiment_key": experiment_key,
                "previous_rollout_percent": previous_rollout_percent,
                "new_rollout_percent": new_rollout_percent,
                "timestamp": datetime.now(UTC).isoformat(),
                "metrics": metrics,
            },
        )
    )


def _current_rollout_percent(db: Session, *, experiment_key: str) -> int:
    value = db.scalar(
        select(AxionExperiment.rollout_percent)
        .where(AxionExperiment.experiment_id == experiment_key)
        .order_by(AxionExperiment.rollout_percent.desc().nullslast())
        .limit(1)
    )
    if value is None:
        return 5
    return max(0, min(100, int(value)))


def _active_experiment_variant_count(db: Session, *, experiment_key: str) -> int:
    return int(
        db.scalar(
            select(func.count(AxionExperiment.variant)).where(
                AxionExperiment.experiment_id == experiment_key,
                AxionExperiment.active.is_(True),
                AxionExperiment.experiment_status == EXPERIMENT_STATUS_ACTIVE,
            )
        )
        or 0
    )


def _last_rollout_scaled_at(db: Session, *, experiment_key: str) -> datetime | None:
    value = db.scalar(
        select(func.max(AxionExperiment.rollout_last_scaled_at)).where(AxionExperiment.experiment_id == experiment_key)
    )
    if isinstance(value, datetime):
        return value
    return None


def _next_rollout_percent(current_percent: int) -> int:
    for step in ROLLOUT_STEPS:
        if current_percent < step:
            return step
    return 100


def _bonferroni_adjust(raw_p_value: float, comparisons: int) -> float:
    comparisons_safe = max(1, int(comparisons))
    return float(min(1.0, max(0.0, float(raw_p_value)) * comparisons_safe))


def _resolve_rollout_policy(
    *,
    min_sample: int | None,
    min_days_between_increase: int | None,
    min_interval_hours: int | None,
) -> tuple[int, int]:
    resolved_min_sample = int(min_sample) if min_sample is not None else int(settings.axion_min_sample_size)
    if min_days_between_increase is not None:
        resolved_min_days = int(min_days_between_increase)
    elif min_interval_hours is not None:
        resolved_min_days = max(1, int(math.ceil(float(min_interval_hours) / 24.0)))
    else:
        resolved_min_days = int(settings.axion_min_days_between_rollout_increase)
    return (max(1, resolved_min_sample), max(1, resolved_min_days))


def _write_rollout_increased_event(
    db: Session,
    *,
    experiment_key: str,
    tenant_id: int | None,
    actor_user_id: int | None,
    previous_rollout_percent: int,
    new_rollout_percent: int,
    metrics: dict[str, float | int],
) -> None:
    if tenant_id is None or not hasattr(db, "add"):
        return
    db.add(
        EventLog(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            child_id=None,
            type="experiment_rollout_increased",
            payload={
                "experiment_key": experiment_key,
                "previous_rollout_percent": int(previous_rollout_percent),
                "new_rollout_percent": int(new_rollout_percent),
                "metrics": metrics,
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )
    )
    send_axion_operational_alert(
        event_type="experiment_rollout_increased",
        experiment_key=experiment_key,
        metric_snapshot={
            "previous_rollout_percent": int(previous_rollout_percent),
            "new_rollout_percent": int(new_rollout_percent),
            **{k: v for k, v in metrics.items() if isinstance(v, (int, float))},
        },
        severity="info",
    )


def _update_rollout_percent(db: Session, *, experiment_key: str, rollout_percent: int, scaled_at: datetime) -> int:
    result = db.execute(
        update(AxionExperiment)
        .where(AxionExperiment.experiment_id == experiment_key)
        .values(rollout_percent=rollout_percent, rollout_last_scaled_at=scaled_at)
    )
    return int(result.rowcount or 0)


def _disable_canary_rollout(
    db: Session,
    *,
    experiment_key: str,
    tenant_id: int | None,
    actor_user_id: int | None,
    metrics: dict[str, float | int],
) -> None:
    now = datetime.now(UTC)
    _update_rollout_percent(db, experiment_key=experiment_key, rollout_percent=0, scaled_at=now)
    if tenant_id is not None and hasattr(db, "add"):
        db.add(
            EventLog(
                tenant_id=tenant_id,
                actor_user_id=actor_user_id,
                child_id=None,
                type="policy_auto_rollback",
                payload={
                    "experiment_key": experiment_key,
                    "reason": "negative_lift_guardrail",
                    "metrics": metrics,
                    "timestamp": now.isoformat(),
                },
            )
        )


def _evaluate_canary_negative_guardrail(
    db: Session,
    *,
    experiment_key: str,
    tenant_id: int | None,
    destination: str | None,
) -> dict[str, float | int] | None:
    variants = _get_active_variants(db, experiment_key=experiment_key)
    non_control = [item for item in variants if item != "CONTROL"]
    if not non_control:
        return None
    control = get_axion_retention_metrics(
        db,
        filters=AxionRetentionFilters(
            tenant_id=tenant_id,
            action_type=None,
            context=None,
            persona=None,
            experiment_key=experiment_key,
            variant="CONTROL",
            nba_reason=None,
            destination=destination,
            dedupe_exposure_per_day=True,
            lookback_days=30,
        ),
    )
    control_clicks = int(control.get("cta_click_users", 0) or 0)
    control_started = int(control.get("cta_session_started_converted_users", 0) or 0)
    if control_clicks <= 0:
        return None

    canary_clicks = 0
    canary_started = 0
    for variant in non_control:
        metrics = get_axion_retention_metrics(
            db,
            filters=AxionRetentionFilters(
                tenant_id=tenant_id,
                action_type=None,
                context=None,
                persona=None,
                experiment_key=experiment_key,
                variant=variant,
                nba_reason=None,
                destination=destination,
                dedupe_exposure_per_day=True,
                lookback_days=30,
            ),
        )
        canary_clicks += int(metrics.get("cta_click_users", 0) or 0)
        canary_started += int(metrics.get("cta_session_started_converted_users", 0) or 0)
    if canary_clicks <= 0:
        return None

    control_rate = float(control_started) / float(control_clicks)
    canary_rate = float(canary_started) / float(canary_clicks)
    uplift = canary_rate - control_rate
    pvalue = _two_proportion_pvalue(canary_started, canary_clicks, control_started, control_clicks)
    if pvalue is None:
        return None
    if uplift < 0.0 and pvalue < 0.05:
        return {
            "canary_clicks": int(canary_clicks),
            "canary_started": int(canary_started),
            "canary_rate": round(canary_rate, 6),
            "control_clicks": int(control_clicks),
            "control_started": int(control_started),
            "control_rate": round(control_rate, 6),
            "uplift": round(uplift, 6),
            "pvalue": round(float(pvalue), 6),
        }
    return None


def evaluate_rollout_progression(
    db: Session,
    *,
    experiment_key: str = EXPERIMENT_KEY_NBA_RETENTION_V1,
    tenant_id: int | None = None,
    actor_user_id: int | None = None,
    destination: str | None = None,
    min_sample: int | None = None,
    min_days_between_increase: int | None = None,
    min_interval_hours: int | None = None,
    lock_experiment: bool = True,
    auto_commit: bool = True,
) -> ExperimentRolloutScaleResult:
    resolved_min_sample, resolved_min_days = _resolve_rollout_policy(
        min_sample=min_sample,
        min_days_between_increase=min_days_between_increase,
        min_interval_hours=min_interval_hours,
    )
    default_result = ExperimentRolloutScaleResult(
        experiment_key=experiment_key,
        scaled=False,
        previous_rollout_percent=_current_rollout_percent(db, experiment_key=experiment_key),
        new_rollout_percent=_current_rollout_percent(db, experiment_key=experiment_key),
        reason="not_eligible",
        metrics={},
    )
    if not settings.auto_scale_rollout_enabled:
        return ExperimentRolloutScaleResult(
            experiment_key=experiment_key,
            scaled=False,
            previous_rollout_percent=default_result.previous_rollout_percent,
            new_rollout_percent=default_result.new_rollout_percent,
            reason="auto_scale_disabled",
            metrics={},
        )

    if lock_experiment and not lock_experiment_for_update(db, experiment_key=experiment_key, skip_locked=False):
        return ExperimentRolloutScaleResult(
            experiment_key=experiment_key,
            scaled=False,
            previous_rollout_percent=default_result.previous_rollout_percent,
            new_rollout_percent=default_result.new_rollout_percent,
            reason="lock_unavailable",
            metrics={},
        )

    active_count = _active_experiment_variant_count(db, experiment_key=experiment_key)
    if active_count == 0:
        return default_result

    variants = _get_active_variants(db, experiment_key=experiment_key)
    if "CONTROL" not in variants:
        return ExperimentRolloutScaleResult(
            experiment_key=experiment_key,
            scaled=False,
            previous_rollout_percent=default_result.previous_rollout_percent,
            new_rollout_percent=default_result.new_rollout_percent,
            reason="missing_control",
            metrics={},
        )

    control = get_axion_retention_metrics(
        db,
        filters=AxionRetentionFilters(
            tenant_id=tenant_id,
            action_type=None,
            context=None,
            persona=None,
            experiment_key=experiment_key,
            variant="CONTROL",
            nba_reason=None,
            destination=destination,
            dedupe_exposure_per_day=True,
            lookback_days=30,
        ),
    )
    control_clicks = int(control.get("cta_click_users", 0) or 0)
    control_started = int(control.get("cta_session_started_converted_users", 0) or 0)
    if control_clicks < int(resolved_min_sample):
        return ExperimentRolloutScaleResult(
            experiment_key=experiment_key,
            scaled=False,
            previous_rollout_percent=default_result.previous_rollout_percent,
            new_rollout_percent=default_result.new_rollout_percent,
            reason="control_min_sample_not_reached",
            metrics={"control_clicks": control_clicks, "min_sample": int(resolved_min_sample)},
        )

    control_rate = float(control_started) / float(control_clicks) if control_clicks > 0 else 0.0
    best_candidate: dict[str, float | int | str] | None = None
    candidate_pool: list[dict[str, float | int | str]] = []
    resolved_tenant_id, resolved_actor_user_id = _resolve_audit_context(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
    )
    for variant in variants:
        if variant == "CONTROL":
            continue
        metrics = get_axion_retention_metrics(
            db,
            filters=AxionRetentionFilters(
                tenant_id=tenant_id,
                action_type=None,
                context=None,
                persona=None,
                experiment_key=experiment_key,
                variant=variant,
                nba_reason=None,
                destination=destination,
                dedupe_exposure_per_day=True,
                lookback_days=30,
            ),
        )
        variant_clicks = int(metrics.get("cta_click_users", 0) or 0)
        variant_started = int(metrics.get("cta_session_started_converted_users", 0) or 0)
        if variant_clicks < int(resolved_min_sample):
            continue
        variant_rate = float(variant_started) / float(variant_clicks) if variant_clicks > 0 else 0.0
        uplift = variant_rate - control_rate
        pvalue = _two_proportion_pvalue(variant_started, variant_clicks, control_started, control_clicks)
        if pvalue is None:
            continue
        candidate_pool.append(
            {
                "variant": variant,
                "control_clicks": control_clicks,
                "control_started": control_started,
                "variant_clicks": variant_clicks,
                "variant_started": variant_started,
                "control_rate": round(control_rate, 6),
                "variant_rate": round(variant_rate, 6),
                "uplift": round(uplift, 6),
                "pvalue": round(pvalue, 6),
            }
        )

    comparisons = len(candidate_pool)
    for candidate in candidate_pool:
        raw_p = float(candidate["pvalue"])
        adjusted_p = _bonferroni_adjust(raw_p, comparisons)
        candidate["pvalue_adjusted"] = round(adjusted_p, 6)
        uplift = float(candidate["uplift"])
        if adjusted_p < 0.05:
            _write_stat_sig_event(
                db,
                experiment_key=experiment_key,
                tenant_id=resolved_tenant_id,
                actor_user_id=resolved_actor_user_id,
                variant=str(candidate["variant"]),
                pvalue=adjusted_p,
                uplift=uplift,
                control_rate=float(candidate["control_rate"]),
                variant_rate=float(candidate["variant_rate"]),
            )
        if uplift > 0.0 and adjusted_p < 0.05:
            if best_candidate is None or float(uplift) > float(best_candidate["uplift"]):
                best_candidate = candidate

    if best_candidate is None:
        if auto_commit:
            db.commit()
        return ExperimentRolloutScaleResult(
            experiment_key=experiment_key,
            scaled=False,
            previous_rollout_percent=default_result.previous_rollout_percent,
            new_rollout_percent=default_result.new_rollout_percent,
            reason="not_significant_positive_lift",
            metrics={},
        )

    previous_rollout = _current_rollout_percent(db, experiment_key=experiment_key)
    last_scaled_at = _last_rollout_scaled_at(db, experiment_key=experiment_key)
    now = datetime.now(UTC)
    if last_scaled_at is not None and (now - last_scaled_at) < timedelta(days=max(1, int(resolved_min_days))):
        if auto_commit:
            db.commit()
        return ExperimentRolloutScaleResult(
            experiment_key=experiment_key,
            scaled=False,
            previous_rollout_percent=previous_rollout,
            new_rollout_percent=previous_rollout,
            reason="min_interval_not_reached",
            metrics={"last_scaled_at": last_scaled_at.isoformat(), "min_days_between_increase": int(resolved_min_days)},
        )

    next_rollout = _next_rollout_percent(previous_rollout)
    if next_rollout <= previous_rollout:
        if auto_commit:
            db.commit()
        return ExperimentRolloutScaleResult(
            experiment_key=experiment_key,
            scaled=False,
            previous_rollout_percent=previous_rollout,
            new_rollout_percent=previous_rollout,
            reason="already_max_rollout",
            metrics=best_candidate,
        )

    _update_rollout_percent(db, experiment_key=experiment_key, rollout_percent=next_rollout, scaled_at=now)
    _write_rollout_scaled_audit(
        db,
        experiment_key=experiment_key,
        tenant_id=resolved_tenant_id,
        actor_user_id=resolved_actor_user_id,
        previous_rollout_percent=previous_rollout,
        new_rollout_percent=next_rollout,
        metrics={k: v for k, v in best_candidate.items() if isinstance(v, (int, float))},
    )
    _write_rollout_increased_event(
        db,
        experiment_key=experiment_key,
        tenant_id=resolved_tenant_id,
        actor_user_id=resolved_actor_user_id,
        previous_rollout_percent=previous_rollout,
        new_rollout_percent=next_rollout,
        metrics={k: v for k, v in best_candidate.items() if isinstance(v, (int, float))},
    )
    logger.info(
        "NBA_EXPERIMENT_ROLLOUT_SCALED",
        extra={
            "experiment_key": experiment_key,
            "previous_rollout_percent": previous_rollout,
            "new_rollout_percent": next_rollout,
            "metrics": best_candidate,
            "tenant_id": resolved_tenant_id,
            "actor_user_id": resolved_actor_user_id,
        },
    )
    if auto_commit:
        db.commit()
    return ExperimentRolloutScaleResult(
        experiment_key=experiment_key,
        scaled=True,
        previous_rollout_percent=previous_rollout,
        new_rollout_percent=next_rollout,
        reason="rollout_scaled",
        metrics=best_candidate,
    )


def get_rollout_status(
    db: Session,
    *,
    experiment_key: str = EXPERIMENT_KEY_NBA_RETENTION_V1,
    tenant_id: int | None = None,
    destination: str | None = None,
    min_sample: int | None = None,
    min_days_between_increase: int | None = None,
) -> ExperimentRolloutStatus:
    resolved_min_sample, resolved_min_days = _resolve_rollout_policy(
        min_sample=min_sample,
        min_days_between_increase=min_days_between_increase,
        min_interval_hours=None,
    )
    current_rollout = _current_rollout_percent(db, experiment_key=experiment_key)
    next_step = _next_rollout_percent(current_rollout)
    if next_step <= current_rollout:
        next_step_value: int | None = None
    else:
        next_step_value = int(next_step)

    now = datetime.now(UTC)
    last_scaled_at = _last_rollout_scaled_at(db, experiment_key=experiment_key)
    days_since_last_change: int | None = None
    if last_scaled_at is not None:
        days_since_last_change = max(0, int((now - last_scaled_at).total_seconds() // 86400))

    if next_step_value is None:
        return ExperimentRolloutStatus(
            experiment_key=experiment_key,
            current_rollout=current_rollout,
            next_step=None,
            days_since_last_change=days_since_last_change,
            eligible_for_increase=False,
            reason="already_max_rollout",
        )

    variants = _get_active_variants(db, experiment_key=experiment_key)
    if "CONTROL" not in variants:
        return ExperimentRolloutStatus(
            experiment_key=experiment_key,
            current_rollout=current_rollout,
            next_step=next_step_value,
            days_since_last_change=days_since_last_change,
            eligible_for_increase=False,
            reason="missing_control",
        )

    control = get_axion_retention_metrics(
        db,
        filters=AxionRetentionFilters(
            tenant_id=tenant_id,
            action_type=None,
            context=None,
            persona=None,
            experiment_key=experiment_key,
            variant="CONTROL",
            nba_reason=None,
            destination=destination,
            dedupe_exposure_per_day=True,
            lookback_days=30,
        ),
    )
    control_clicks = int(control.get("cta_click_users", 0) or 0)
    control_started = int(control.get("cta_session_started_converted_users", 0) or 0)
    if control_clicks < resolved_min_sample:
        return ExperimentRolloutStatus(
            experiment_key=experiment_key,
            current_rollout=current_rollout,
            next_step=next_step_value,
            days_since_last_change=days_since_last_change,
            eligible_for_increase=False,
            reason="control_min_sample_not_reached",
        )

    control_rate = float(control_started) / float(control_clicks) if control_clicks > 0 else 0.0
    candidate_pool: list[dict[str, float]] = []
    for variant in variants:
        if variant == "CONTROL":
            continue
        metrics = get_axion_retention_metrics(
            db,
            filters=AxionRetentionFilters(
                tenant_id=tenant_id,
                action_type=None,
                context=None,
                persona=None,
                experiment_key=experiment_key,
                variant=variant,
                nba_reason=None,
                destination=destination,
                dedupe_exposure_per_day=True,
                lookback_days=30,
            ),
        )
        variant_clicks = int(metrics.get("cta_click_users", 0) or 0)
        variant_started = int(metrics.get("cta_session_started_converted_users", 0) or 0)
        if variant_clicks < resolved_min_sample:
            continue
        variant_rate = float(variant_started) / float(variant_clicks) if variant_clicks > 0 else 0.0
        pvalue = _two_proportion_pvalue(variant_started, variant_clicks, control_started, control_clicks)
        if pvalue is None:
            continue
        candidate_pool.append({"uplift": variant_rate - control_rate, "pvalue": pvalue})

    comparisons = len(candidate_pool)
    has_positive_significant = any(
        float(item["uplift"]) > 0.0 and _bonferroni_adjust(float(item["pvalue"]), comparisons) < 0.05 for item in candidate_pool
    )
    if not has_positive_significant:
        return ExperimentRolloutStatus(
            experiment_key=experiment_key,
            current_rollout=current_rollout,
            next_step=next_step_value,
            days_since_last_change=days_since_last_change,
            eligible_for_increase=False,
            reason="not_significant_positive_lift",
        )

    if last_scaled_at is not None and (now - last_scaled_at) < timedelta(days=resolved_min_days):
        return ExperimentRolloutStatus(
            experiment_key=experiment_key,
            current_rollout=current_rollout,
            next_step=next_step_value,
            days_since_last_change=days_since_last_change,
            eligible_for_increase=False,
            reason="min_interval_not_reached",
        )

    return ExperimentRolloutStatus(
        experiment_key=experiment_key,
        current_rollout=current_rollout,
        next_step=next_step_value,
        days_since_last_change=days_since_last_change,
        eligible_for_increase=True,
        reason="eligible",
    )


def _two_proportion_pvalue(success_a: int, total_a: int, success_b: int, total_b: int) -> float | None:
    if total_a <= 0 or total_b <= 0:
        return None
    p1 = float(success_a) / float(total_a)
    p2 = float(success_b) / float(total_b)
    pooled = float(success_a + success_b) / float(total_a + total_b)
    variance = pooled * (1.0 - pooled) * (1.0 / float(total_a) + 1.0 / float(total_b))
    if variance <= 0:
        return None
    z = (p1 - p2) / math.sqrt(variance)
    # two-sided p-value using normal CDF via erf
    cdf = 0.5 * (1.0 + math.erf(abs(z) / math.sqrt(2.0)))
    return max(0.0, min(1.0, 2.0 * (1.0 - cdf)))


def evaluate_experiment_health(
    db: Session,
    *,
    experiment_key: str = EXPERIMENT_KEY_NBA_RETENTION_V1,
    tenant_id: int | None = None,
    actor_user_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    destination: str | None = None,
    session_started_drop_threshold_pct: float = 30.0,
    error_rate_threshold_pct: float = 5.0,
    lock_experiment: bool = True,
    auto_commit: bool = True,
) -> ExperimentHealthResult:
    if lock_experiment and not lock_experiment_for_update(db, experiment_key=experiment_key, skip_locked=False):
        return ExperimentHealthResult(experiment_key=experiment_key, paused=False, reasons=["lock_unavailable"], metrics={})
    variants = _get_active_variants(db, experiment_key=experiment_key)
    if not variants:
        return ExperimentHealthResult(experiment_key=experiment_key, paused=False, reasons=[], metrics={})

    control_metrics = get_axion_retention_metrics(
        db,
        filters=AxionRetentionFilters(
            tenant_id=tenant_id,
            action_type=None,
            context=None,
            persona=None,
            experiment_key=experiment_key,
            variant="CONTROL",
            nba_reason=None,
            destination=destination,
            dedupe_exposure_per_day=True,
            lookback_days=30,
            date_from=date_from,
            date_to=date_to,
        ),
    )
    control_started_pct = float(control_metrics.get("cta_to_session_started_conversion", 0.0) or 0.0)

    reasons: list[str] = []
    variant_deltas: dict[str, float] = {}
    if control_started_pct > 0:
        for variant in variants:
            if variant == "CONTROL":
                continue
            variant_metrics = get_axion_retention_metrics(
                db,
                filters=AxionRetentionFilters(
                    tenant_id=tenant_id,
                    action_type=None,
                    context=None,
                    persona=None,
                    experiment_key=experiment_key,
                    variant=variant,
                    nba_reason=None,
                    destination=destination,
                    dedupe_exposure_per_day=True,
                    lookback_days=30,
                    date_from=date_from,
                    date_to=date_to,
                ),
            )
            variant_started_pct = float(variant_metrics.get("cta_to_session_started_conversion", 0.0) or 0.0)
            drop_pct = ((control_started_pct - variant_started_pct) / control_started_pct) * 100.0
            variant_deltas[variant] = round(drop_pct, 2)
            if drop_pct > session_started_drop_threshold_pct:
                reasons.append(f"session_started_drop_gt_{session_started_drop_threshold_pct:.0f}_pct:{variant}")

    overall = get_axion_retention_metrics(
        db,
        filters=AxionRetentionFilters(
            tenant_id=tenant_id,
            action_type=None,
            context=None,
            persona=None,
            experiment_key=experiment_key,
            variant=None,
            nba_reason=None,
            destination=destination,
            dedupe_exposure_per_day=True,
            lookback_days=30,
            date_from=date_from,
            date_to=date_to,
        ),
    )
    exposures_total = int(overall.get("exposures_total", 0) or 0)
    error_count = _count_experiment_events(db, experiment_key=experiment_key, event_types=ERROR_EVENT_TYPES)
    crash_count = _count_experiment_events(db, experiment_key=experiment_key, event_types=CRASH_EVENT_TYPES)
    invalid_decisions = _count_invalid_decisions(db, experiment_key=experiment_key)

    error_rate_pct = (float(error_count) / float(exposures_total) * 100.0) if exposures_total > 0 else 0.0
    if error_rate_pct > error_rate_threshold_pct:
        reasons.append(f"error_rate_gt_{error_rate_threshold_pct:.2f}_pct")
    if crash_count > 0:
        reasons.append("crash_detected")
    if invalid_decisions > 0:
        reasons.append("invalid_decision_detected")

    metrics: dict[str, float | int] = {
        "control_cta_to_started_pct": round(control_started_pct, 2),
        "error_count": error_count,
        "crash_count": crash_count,
        "invalid_decisions": invalid_decisions,
        "exposures_total": exposures_total,
        "error_rate_pct": round(error_rate_pct, 2),
    }
    for variant, drop in variant_deltas.items():
        metrics[f"{variant.lower()}_drop_pct_vs_control"] = drop

    canary_guardrail_metrics = _evaluate_canary_negative_guardrail(
        db,
        experiment_key=experiment_key,
        tenant_id=tenant_id,
        destination=destination,
    )
    if canary_guardrail_metrics is not None:
        resolved_tenant_id, resolved_actor_user_id = _resolve_audit_context(
            db,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
        )
        _disable_canary_rollout(
            db,
            experiment_key=experiment_key,
            tenant_id=resolved_tenant_id,
            actor_user_id=resolved_actor_user_id,
            metrics=canary_guardrail_metrics,
        )
        reasons.append("canary_negative_lift_guardrail")
        metrics.update({f"canary_{k}": v for k, v in canary_guardrail_metrics.items()})

    paused = False
    pause_reasons = [item for item in reasons if item != "canary_negative_lift_guardrail"]
    if pause_reasons:
        _deactivate_experiment(db, experiment_key=experiment_key)
        resolved_tenant_id, resolved_actor_user_id = _resolve_audit_context(
            db,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
        )
        _write_auto_pause_audit(
            db,
            experiment_key=experiment_key,
            tenant_id=resolved_tenant_id,
            actor_user_id=resolved_actor_user_id,
            reasons=pause_reasons,
            metrics=metrics,
        )
        send_axion_operational_alert(
            event_type="experiment_auto_paused",
            experiment_key=experiment_key,
            metric_snapshot={
                "reasons": pause_reasons,
                **metrics,
            },
            severity="critical",
        )
        logger.error(
            "NBA_EXPERIMENT_AUTO_PAUSED",
            extra={
                "experiment_key": experiment_key,
                "reasons": pause_reasons,
                "metrics": metrics,
                "tenant_id": resolved_tenant_id,
                "actor_user_id": resolved_actor_user_id,
            },
        )
        paused = True
        if auto_commit:
            db.commit()
    elif auto_commit:
        db.commit()

    return ExperimentHealthResult(
        experiment_key=experiment_key,
        paused=paused,
        reasons=reasons,
        metrics=metrics,
    )


def evaluate_experiment_winner(
    db: Session,
    *,
    experiment_key: str = EXPERIMENT_KEY_NBA_RETENTION_V1,
    tenant_id: int | None = None,
    actor_user_id: int | None = None,
    destination: str | None = None,
    min_days: int = 14,
    min_sample: int = 200,
    lock_experiment: bool = True,
    auto_commit: bool = True,
) -> ExperimentWinnerResult:
    if lock_experiment and not lock_experiment_for_update(db, experiment_key=experiment_key, skip_locked=False):
        return ExperimentWinnerResult(
            experiment_key=experiment_key,
            winner_variant=None,
            eligible=False,
            reason="lock_unavailable",
            metrics={},
        )
    variants = _get_active_variants(db, experiment_key=experiment_key)
    if not variants or "CONTROL" not in variants:
        return ExperimentWinnerResult(
            experiment_key=experiment_key,
            winner_variant=None,
            eligible=False,
            reason="missing_control_or_active_variants",
            metrics={},
        )

    start_date = db.scalar(
        select(func.min(AxionExperiment.start_date)).where(AxionExperiment.experiment_id == experiment_key)
    )
    days_running = 0
    if isinstance(start_date, date):
        days_running = (datetime.now(UTC).date() - start_date).days
    if days_running < int(min_days):
        return ExperimentWinnerResult(
            experiment_key=experiment_key,
            winner_variant=None,
            eligible=False,
            reason="min_days_not_reached",
            metrics={"days_running": days_running, "min_days": int(min_days)},
        )

    control_metrics = get_axion_retention_metrics(
        db,
        filters=AxionRetentionFilters(
            tenant_id=tenant_id,
            action_type=None,
            context=None,
            persona=None,
            experiment_key=experiment_key,
            variant="CONTROL",
            nba_reason=None,
            destination=destination,
            dedupe_exposure_per_day=True,
            lookback_days=max(30, int(min_days)),
        ),
    )
    control_clicks = int(control_metrics.get("cta_click_users", 0) or 0)
    control_started = int(control_metrics.get("cta_session_started_converted_users", 0) or 0)
    control_d7 = float(control_metrics.get("d7_rate", 0.0) or 0.0)

    if control_clicks < int(min_sample):
        return ExperimentWinnerResult(
            experiment_key=experiment_key,
            winner_variant=None,
            eligible=False,
            reason="control_min_sample_not_reached",
            metrics={"control_clicks": control_clicks, "min_sample": int(min_sample)},
        )

    best_variant: str | None = None
    best_uplift = float("-inf")
    best_metrics: dict[str, float | int] = {}
    negative_guardrail_hit: dict[str, float | int | str] | None = None

    control_rate = float(control_started) / float(control_clicks) if control_clicks > 0 else 0.0
    resolved_tenant_id, resolved_actor_user_id = _resolve_audit_context(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
    )
    for variant in variants:
        if variant == "CONTROL":
            continue
        variant_metrics = get_axion_retention_metrics(
            db,
            filters=AxionRetentionFilters(
                tenant_id=tenant_id,
                action_type=None,
                context=None,
                persona=None,
                experiment_key=experiment_key,
                variant=variant,
                nba_reason=None,
                destination=destination,
                dedupe_exposure_per_day=True,
                lookback_days=max(30, int(min_days)),
            ),
        )
        variant_clicks = int(variant_metrics.get("cta_click_users", 0) or 0)
        variant_started = int(variant_metrics.get("cta_session_started_converted_users", 0) or 0)
        variant_d7 = float(variant_metrics.get("d7_rate", 0.0) or 0.0)
        if variant_clicks < int(min_sample):
            continue
        variant_rate = float(variant_started) / float(variant_clicks) if variant_clicks > 0 else 0.0
        uplift = variant_rate - control_rate
        pvalue = _two_proportion_pvalue(variant_started, variant_clicks, control_started, control_clicks)
        if pvalue is None:
            continue
        if pvalue < 0.05:
            _write_stat_sig_event(
                db,
                experiment_key=experiment_key,
                tenant_id=resolved_tenant_id,
                actor_user_id=resolved_actor_user_id,
                variant=variant,
                pvalue=pvalue,
                uplift=uplift,
                control_rate=control_rate,
                variant_rate=variant_rate,
            )
        if uplift < 0.0 and pvalue < 0.05:
            negative_guardrail_hit = {
                "variant": variant,
                "control_clicks": control_clicks,
                "control_started": control_started,
                "control_rate": round(control_rate, 6),
                "variant_clicks": variant_clicks,
                "variant_started": variant_started,
                "variant_rate": round(variant_rate, 6),
                "uplift": round(uplift, 6),
                "pvalue": round(pvalue, 6),
                "days_running": days_running,
            }
        if uplift > 0.0 and pvalue < 0.05 and variant_d7 >= control_d7:
            if uplift > best_uplift:
                best_uplift = uplift
                best_variant = variant
                best_metrics = {
                    "control_clicks": control_clicks,
                    "control_started": control_started,
                    "control_rate": round(control_rate, 6),
                    "control_d7_rate": round(control_d7, 4),
                    "variant_clicks": variant_clicks,
                    "variant_started": variant_started,
                    "variant_rate": round(variant_rate, 6),
                    "variant_d7_rate": round(variant_d7, 4),
                    "uplift": round(uplift, 6),
                    "pvalue": round(pvalue, 6),
                    "days_running": days_running,
                }

    if negative_guardrail_hit is not None:
        _deactivate_experiment(db, experiment_key=experiment_key, status_value=EXPERIMENT_STATUS_AUTO_PAUSED)
        pause_reasons = ["negative_lift_guardrail"]
        _write_auto_pause_audit(
            db,
            experiment_key=experiment_key,
            tenant_id=resolved_tenant_id,
            actor_user_id=resolved_actor_user_id,
            reasons=pause_reasons,
            metrics={k: v for k, v in negative_guardrail_hit.items() if k != "variant"},
        )
        logger.error(
            "NBA_EXPERIMENT_AUTO_PAUSED",
            extra={
                "experiment_key": experiment_key,
                "reasons": pause_reasons,
                "metrics": negative_guardrail_hit,
                "tenant_id": resolved_tenant_id,
                "actor_user_id": resolved_actor_user_id,
            },
        )
        if auto_commit:
            db.commit()
        return ExperimentWinnerResult(
            experiment_key=experiment_key,
            winner_variant=None,
            eligible=False,
            reason="negative_lift_guardrail",
            metrics=negative_guardrail_hit,
        )

    if best_variant is None:
        if auto_commit:
            db.commit()
        return ExperimentWinnerResult(
            experiment_key=experiment_key,
            winner_variant=None,
            eligible=False,
            reason="no_significant_winner",
            metrics={"days_running": days_running, "min_sample": int(min_sample)},
        )

    _set_winner_variant(db, experiment_key=experiment_key, winner_variant=best_variant)
    _write_winner_audit(
        db,
        experiment_key=experiment_key,
        winner_variant=best_variant,
        tenant_id=resolved_tenant_id,
        actor_user_id=resolved_actor_user_id,
        metrics=best_metrics,
    )
    logger.info(
        "NBA_EXPERIMENT_WINNER_MARKED",
        extra={
            "experiment_key": experiment_key,
            "winner_variant": best_variant,
            "metrics": best_metrics,
            "tenant_id": resolved_tenant_id,
            "actor_user_id": resolved_actor_user_id,
        },
    )
    if auto_commit:
        db.commit()
    return ExperimentWinnerResult(
        experiment_key=experiment_key,
        winner_variant=best_variant,
        eligible=True,
        reason="winner_marked",
        metrics=best_metrics,
    )


def generate_experiment_summary(
    db: Session,
    experiment_key: str,
    *,
    tenant_id: int | None = None,
    destination: str | None = None,
    min_sample: int = 200,
    significance_threshold: float = 0.05,
) -> str:
    variants = [
        str(item)
        for item in db.scalars(
            select(AxionExperiment.variant)
            .where(AxionExperiment.experiment_id == experiment_key)
            .order_by(AxionExperiment.variant.asc())
        ).all()
    ]
    unique_variants = sorted(set(variants))
    has_control = "CONTROL" in unique_variants

    start_date = db.scalar(
        select(func.min(AxionExperiment.start_date)).where(AxionExperiment.experiment_id == experiment_key)
    )
    end_date = db.scalar(
        select(func.max(AxionExperiment.end_date)).where(AxionExperiment.experiment_id == experiment_key)
    )

    today = datetime.now(UTC).date()
    effective_start = start_date if isinstance(start_date, date) else today
    effective_end = end_date if isinstance(end_date, date) else today
    if effective_end < effective_start:
        effective_end = effective_start
    days_running = (effective_end - effective_start).days + 1

    overall_metrics = get_axion_retention_metrics(
        db,
        filters=AxionRetentionFilters(
            tenant_id=tenant_id,
            action_type=None,
            context=None,
            persona=None,
            experiment_key=experiment_key,
            variant=None,
            nba_reason=None,
            destination=destination,
            dedupe_exposure_per_day=True,
            lookback_days=max(30, days_running),
            date_from=effective_start,
            date_to=effective_end,
        ),
    )
    total_users = int(overall_metrics.get("cohort_users", 0) or 0)

    recommendation = "manter"
    reason = "amostra ainda insuficiente para decisão"
    uplift_line = "indisponível"
    significance_line = "não significativo"

    if has_control:
        control_metrics = get_axion_retention_metrics(
            db,
            filters=AxionRetentionFilters(
                tenant_id=tenant_id,
                action_type=None,
                context=None,
                persona=None,
                experiment_key=experiment_key,
                variant="CONTROL",
                nba_reason=None,
                destination=destination,
                dedupe_exposure_per_day=True,
                lookback_days=max(30, days_running),
                date_from=effective_start,
                date_to=effective_end,
            ),
        )
        control_clicks = int(control_metrics.get("cta_click_users", 0) or 0)
        control_started = int(control_metrics.get("cta_session_started_converted_users", 0) or 0)
        control_rate = (float(control_started) / float(control_clicks)) if control_clicks > 0 else 0.0
        control_d7 = float(control_metrics.get("d7_rate", 0.0) or 0.0)

        best_candidate: dict[str, float | int | str] | None = None
        worst_candidate: dict[str, float | int | str] | None = None

        for variant in unique_variants:
            if variant == "CONTROL":
                continue
            metrics = get_axion_retention_metrics(
                db,
                filters=AxionRetentionFilters(
                    tenant_id=tenant_id,
                    action_type=None,
                    context=None,
                    persona=None,
                    experiment_key=experiment_key,
                    variant=variant,
                    nba_reason=None,
                    destination=destination,
                    dedupe_exposure_per_day=True,
                    lookback_days=max(30, days_running),
                    date_from=effective_start,
                    date_to=effective_end,
                ),
            )
            variant_clicks = int(metrics.get("cta_click_users", 0) or 0)
            variant_started = int(metrics.get("cta_session_started_converted_users", 0) or 0)
            variant_rate = (float(variant_started) / float(variant_clicks)) if variant_clicks > 0 else 0.0
            variant_d7 = float(metrics.get("d7_rate", 0.0) or 0.0)
            p_value = _two_proportion_pvalue(variant_started, variant_clicks, control_started, control_clicks)
            if p_value is None:
                continue
            uplift_pp = (variant_rate - control_rate) * 100.0
            candidate = {
                "variant": variant,
                "variant_clicks": variant_clicks,
                "variant_started": variant_started,
                "variant_rate": variant_rate,
                "variant_d7": variant_d7,
                "uplift_pp": uplift_pp,
                "p_value": p_value,
                "control_clicks": control_clicks,
                "control_started": control_started,
                "control_rate": control_rate,
                "control_d7": control_d7,
            }

            if best_candidate is None or float(candidate["uplift_pp"]) > float(best_candidate["uplift_pp"]):
                best_candidate = candidate
            if worst_candidate is None or float(candidate["uplift_pp"]) < float(worst_candidate["uplift_pp"]):
                worst_candidate = candidate

        if best_candidate is not None:
            uplift_line = (
                f"{best_candidate['variant']} {float(best_candidate['uplift_pp']):+.2f}pp "
                f"(CONTROL {float(best_candidate['control_rate']) * 100:.2f}% -> "
                f"{float(best_candidate['variant_rate']) * 100:.2f}%)"
            )
            significance_line = (
                f"p_value={float(best_candidate['p_value']):.4f} | "
                f"amostra control={int(best_candidate['control_clicks'])}, "
                f"amostra variante={int(best_candidate['variant_clicks'])} | "
                f"D7 control={float(best_candidate['control_d7']):.2f}%, "
                f"D7 variante={float(best_candidate['variant_d7']):.2f}%"
            )

            enough_sample = (
                int(best_candidate["control_clicks"]) >= int(min_sample)
                and int(best_candidate["variant_clicks"]) >= int(min_sample)
            )
            positive_and_significant = (
                float(best_candidate["uplift_pp"]) > 0.0
                and float(best_candidate["p_value"]) < float(significance_threshold)
                and float(best_candidate["variant_d7"]) >= float(best_candidate["control_d7"])
            )
            negative_and_significant = (
                worst_candidate is not None
                and float(worst_candidate["uplift_pp"]) < 0.0
                and float(worst_candidate["p_value"]) < float(significance_threshold)
                and float(worst_candidate["variant_clicks"]) >= int(min_sample)
                and float(worst_candidate["control_clicks"]) >= int(min_sample)
            )

            if enough_sample and positive_and_significant:
                recommendation = "escalar"
                reason = "uplift positivo com significância estatística e D7 não inferior ao controle"
            elif enough_sample and negative_and_significant:
                recommendation = "encerrar"
                reason = "variante com queda significativa versus controle"
            else:
                recommendation = "manter"
                reason = "monitorar até consolidar significância/amostra mínima"
        else:
            reason = "sem dados suficientes por variante para calcular uplift/p_value"
    else:
        reason = "controle ausente no experimento; manter coleta antes de decisão"

    period_line = f"{effective_start.isoformat()} -> {effective_end.isoformat()} ({days_running} dias)"
    summary_lines = [
        f"Resumo do experimento {experiment_key}",
        f"- Período: {period_line}",
        f"- Total usuários: {total_users}",
        f"- Uplift principal: {uplift_line}",
        f"- Significância: {significance_line}",
        f"- Recomendação: {recommendation} ({reason})",
    ]
    return "\n".join(summary_lines)
