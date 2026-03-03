from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import EventLog, Membership, Tenant
from app.services.axion_drift import evaluate_drift_status
from app.services.axion_policy_governance import (
    POLICY_STATE_ACTIVE,
    POLICY_STATE_CANARY,
    POLICY_STATE_ROLLED_BACK,
    get_current_policy_state,
    transition_policy_state,
)

ERROR_EVENT_TYPES = ("axion_brief_error", "axion_orchestrator_error", "axion_decision_invalid")


@dataclass(slots=True)
class AutoRollbackThresholds:
    error_rate_threshold: float
    p95_latency_threshold_ms: float
    drift_threshold: float


@dataclass(slots=True)
class AutoRollbackResult:
    experiment_key: str
    rolled_back: bool
    reasons: list[str]
    metrics: dict[str, float | int]


def _resolve_thresholds(
    *,
    error_rate_threshold: float | None = None,
    p95_latency_threshold_ms: float | None = None,
    drift_threshold: float | None = None,
) -> AutoRollbackThresholds:
    return AutoRollbackThresholds(
        error_rate_threshold=max(
            0.0,
            float(
                settings.axion_auto_rollback_error_rate_threshold
                if error_rate_threshold is None
                else error_rate_threshold
            ),
        ),
        p95_latency_threshold_ms=max(
            0.0,
            float(
                settings.axion_auto_rollback_p95_latency_threshold_ms
                if p95_latency_threshold_ms is None
                else p95_latency_threshold_ms
            ),
        ),
        drift_threshold=max(
            0.0,
            float(
                settings.axion_auto_rollback_drift_threshold
                if drift_threshold is None
                else drift_threshold
            ),
        ),
    )


def _resolve_tenant_id(db: Session, *, experiment_key: str, tenant_id: int | None) -> int | None:
    if tenant_id is not None:
        return int(tenant_id)
    if not hasattr(db, "scalar"):
        return None
    from_decisions = db.scalar(
        text(
            """
            SELECT tenant_id
            FROM axion_decisions
            WHERE experiment_key = :experiment_key
              AND tenant_id IS NOT NULL
            ORDER BY decided_at DESC
            LIMIT 1
            """
        ),
        {"experiment_key": experiment_key},
    )
    if from_decisions is not None:
        return int(from_decisions)
    fallback = db.scalar(select(Tenant.id).order_by(Tenant.id.asc()).limit(1))
    return int(fallback) if fallback is not None else None


def _resolve_actor_user_id(db: Session, *, tenant_id: int | None) -> int | None:
    if tenant_id is None:
        return None
    if not hasattr(db, "scalar"):
        return None
    value = db.scalar(
        select(Membership.user_id)
        .where(Membership.tenant_id == tenant_id)
        .order_by(Membership.user_id.asc())
        .limit(1)
    )
    return int(value) if value is not None else None


def _load_operational_metrics(
    db: Session,
    *,
    experiment_key: str,
    tenant_id: int | None,
    lookback_minutes: int = 30,
) -> dict[str, float | int]:
    if not hasattr(db, "execute"):
        return {
            "exposures_total": 0,
            "error_total": 0,
            "error_rate_pct": 0.0,
            "p95_latency_ms": 0.0,
        }
    since = datetime.now(UTC) - timedelta(minutes=max(1, int(lookback_minutes)))
    result = db.execute(
        text(
            """
            WITH exposures AS (
                SELECT COUNT(*)::int AS exposures_total
                FROM event_log e
                JOIN axion_decisions d
                  ON d.id = (e.payload->>'decision_id')::uuid
                WHERE e.type = 'axion_brief_exposed'
                  AND d.experiment_key = :experiment_key
                  AND (:tenant_id::int IS NULL OR d.tenant_id = :tenant_id)
                  AND e.created_at >= :since
            ),
            errors AS (
                SELECT COUNT(*)::int AS error_total
                FROM event_log e
                JOIN axion_decisions d
                  ON d.id = (e.payload->>'decision_id')::uuid
                WHERE e.type = ANY(:error_types)
                  AND d.experiment_key = :experiment_key
                  AND (:tenant_id::int IS NULL OR d.tenant_id = :tenant_id)
                  AND e.created_at >= :since
            ),
            lat AS (
                SELECT
                    COALESCE(
                        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (e.payload->>'duration_ms')::numeric),
                        0
                    )::float AS p95_latency_ms
                FROM event_log e
                JOIN axion_decisions d
                  ON d.id = (e.payload->>'decision_id')::uuid
                WHERE e.type = 'axion_decision_latency_ms'
                  AND d.experiment_key = :experiment_key
                  AND (:tenant_id::int IS NULL OR d.tenant_id = :tenant_id)
                  AND e.created_at >= :since
                  AND (e.payload->>'duration_ms') ~ '^[0-9]+(\\.[0-9]+)?$'
            )
            SELECT
                exposures.exposures_total,
                errors.error_total,
                lat.p95_latency_ms
            FROM exposures, errors, lat
            """
        ),
        {
            "experiment_key": experiment_key,
            "tenant_id": tenant_id,
            "error_types": list(ERROR_EVENT_TYPES),
            "since": since,
        },
    )
    if result is None or not hasattr(result, "mappings"):
        return {
            "exposures_total": 0,
            "error_total": 0,
            "error_rate_pct": 0.0,
            "p95_latency_ms": 0.0,
        }
    row = result.mappings().first()
    exposures_total = int((row or {}).get("exposures_total") or 0)
    error_total = int((row or {}).get("error_total") or 0)
    p95_latency_ms = float((row or {}).get("p95_latency_ms") or 0.0)
    error_rate = (float(error_total) / float(exposures_total) * 100.0) if exposures_total > 0 else 0.0
    return {
        "exposures_total": exposures_total,
        "error_total": error_total,
        "error_rate_pct": round(error_rate, 4),
        "p95_latency_ms": round(p95_latency_ms, 4),
    }


def evaluate_auto_rollback(
    db: Session,
    *,
    experiment_key: str = "nba_retention_v1",
    tenant_id: int | None = None,
    error_rate_threshold: float | None = None,
    p95_latency_threshold_ms: float | None = None,
    drift_threshold: float | None = None,
    lookback_minutes: int = 30,
    auto_commit: bool = True,
) -> AutoRollbackResult:
    thresholds = _resolve_thresholds(
        error_rate_threshold=error_rate_threshold,
        p95_latency_threshold_ms=p95_latency_threshold_ms,
        drift_threshold=drift_threshold,
    )
    resolved_tenant_id = _resolve_tenant_id(db, experiment_key=experiment_key, tenant_id=tenant_id)
    metrics = _load_operational_metrics(
        db,
        experiment_key=experiment_key,
        tenant_id=resolved_tenant_id,
        lookback_minutes=lookback_minutes,
    )
    try:
        drift_status = evaluate_drift_status(
            db,
            tenant_id=(resolved_tenant_id or 0),
            experiment_key=experiment_key,
        )
    except Exception:
        drift_status = None
    drift_score = max(
        float(getattr(drift_status, "feature_drift_score", 0.0) or 0.0),
        float(getattr(drift_status, "outcome_drift_pct", 0.0) or 0.0) / 100.0,
    )
    metrics["drift_score"] = round(drift_score, 6)
    reasons: list[str] = []
    if float(metrics["error_rate_pct"]) > thresholds.error_rate_threshold:
        reasons.append("error_rate_threshold_exceeded")
    if float(metrics["p95_latency_ms"]) > thresholds.p95_latency_threshold_ms:
        reasons.append("p95_latency_threshold_exceeded")
    if drift_score > thresholds.drift_threshold:
        reasons.append("drift_threshold_exceeded")
    if not reasons:
        return AutoRollbackResult(
            experiment_key=experiment_key,
            rolled_back=False,
            reasons=[],
            metrics=metrics,
        )

    current_state = get_current_policy_state(
        db,
        tenant_id=(resolved_tenant_id or 0),
        experiment_key=experiment_key,
    )
    if current_state == POLICY_STATE_ROLLED_BACK:
        return AutoRollbackResult(
            experiment_key=experiment_key,
            rolled_back=False,
            reasons=["already_rolled_back", *reasons],
            metrics=metrics,
        )
    if current_state not in {POLICY_STATE_CANARY, POLICY_STATE_ACTIVE}:
        return AutoRollbackResult(
            experiment_key=experiment_key,
            rolled_back=False,
            reasons=["state_not_rollout", *reasons],
            metrics=metrics,
        )

    actor_user_id = _resolve_actor_user_id(db, tenant_id=resolved_tenant_id)
    transition_policy_state(
        db,
        tenant_id=(resolved_tenant_id or 0),
        experiment_key=experiment_key,
        to_state=POLICY_STATE_ROLLED_BACK,
        actor_user_id=actor_user_id,
        reason=f"auto_rollback:{','.join(reasons)}",
        auto_commit=False,
    )
    if hasattr(db, "add") and resolved_tenant_id is not None:
        db.add(
            EventLog(
                tenant_id=resolved_tenant_id,
                actor_user_id=actor_user_id,
                child_id=None,
                type="axion_auto_rollback",
                payload={
                    "experiment_key": experiment_key,
                    "reasons": reasons,
                    "metrics": metrics,
                    "thresholds": {
                        "error_rate_threshold": thresholds.error_rate_threshold,
                        "p95_latency_threshold_ms": thresholds.p95_latency_threshold_ms,
                        "drift_threshold": thresholds.drift_threshold,
                    },
                    "timestamp": datetime.now(UTC).isoformat(),
                },
            )
        )
    if auto_commit:
        db.commit()
    return AutoRollbackResult(
        experiment_key=experiment_key,
        rolled_back=True,
        reasons=reasons,
        metrics=metrics,
    )
