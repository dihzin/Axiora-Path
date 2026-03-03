from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import json

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings


@dataclass(slots=True)
class AxionDriftStatus:
    status: str
    feature_drift_score: float
    outcome_drift_pct: float
    baseline_feature_samples: int
    recent_feature_samples: int
    baseline_reward_avg: float
    recent_reward_avg: float
    per_feature_drift: list[dict[str, object]]
    top_drifting_features: list[dict[str, object]]


def _distribution_distance(baseline: list[str], recent: list[str]) -> float:
    if not baseline or not recent:
        return 0.0
    base_counts = Counter(baseline)
    recent_counts = Counter(recent)
    base_total = float(sum(base_counts.values()))
    recent_total = float(sum(recent_counts.values()))
    keys = set(base_counts) | set(recent_counts)
    l1 = 0.0
    for key in keys:
        p = float(base_counts.get(key, 0)) / base_total
        q = float(recent_counts.get(key, 0)) / recent_total
        l1 += abs(p - q)
    return max(0.0, min(1.0, 0.5 * l1))


def _load_feature_signatures(
    db: Session,
    *,
    tenant_id: int,
    time_from: datetime,
    time_to: datetime,
    limit: int = 5000,
) -> list[str]:
    rows = db.execute(
        text(
            """
            SELECT features_json
            FROM axion_feature_snapshot
            WHERE tenant_id = :tenant_id
              AND snapshot_at >= :time_from
              AND snapshot_at < :time_to
            ORDER BY snapshot_at DESC
            LIMIT :limit
            """
        ),
        {
            "tenant_id": tenant_id,
            "time_from": time_from,
            "time_to": time_to,
            "limit": int(limit),
        },
    ).mappings().all()
    signatures: list[str] = []
    for row in rows:
        payload = row.get("features_json")
        if isinstance(payload, dict):
            signatures.append(json.dumps(payload, sort_keys=True, separators=(",", ":")))
        else:
            signatures.append(str(payload or ""))
    return signatures


def _load_feature_payloads(
    db: Session,
    *,
    tenant_id: int,
    time_from: datetime,
    time_to: datetime,
    limit: int = 5000,
) -> list[dict[str, object]]:
    rows = db.execute(
        text(
            """
            SELECT features_json
            FROM axion_feature_snapshot
            WHERE tenant_id = :tenant_id
              AND snapshot_at >= :time_from
              AND snapshot_at < :time_to
            ORDER BY snapshot_at DESC
            LIMIT :limit
            """
        ),
        {
            "tenant_id": tenant_id,
            "time_from": time_from,
            "time_to": time_to,
            "limit": int(limit),
        },
    ).mappings().all()
    payloads: list[dict[str, object]] = []
    for row in rows:
        payload = row.get("features_json")
        if isinstance(payload, dict):
            payloads.append(dict(payload))
    return payloads


def _resolve_feature_thresholds() -> dict[str, float]:
    raw = (settings.axion_feature_drift_thresholds_json or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except Exception:
        return {}
    if not isinstance(parsed, dict):
        return {}
    output: dict[str, float] = {}
    for key, value in parsed.items():
        try:
            output[str(key)] = max(0.0, float(value))
        except Exception:
            continue
    return output


def _normalize_feature_value(value: object) -> str:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return json.dumps(value, separators=(",", ":"), sort_keys=True)
    return json.dumps(value, separators=(",", ":"), sort_keys=True, default=str)


def _compute_per_feature_drift(
    baseline_payloads: list[dict[str, object]],
    recent_payloads: list[dict[str, object]],
    *,
    default_threshold: float,
    threshold_by_feature: dict[str, float],
) -> tuple[list[dict[str, object]], list[dict[str, object]], float]:
    keys: set[str] = set()
    for row in baseline_payloads:
        keys.update(str(k) for k in row.keys())
    for row in recent_payloads:
        keys.update(str(k) for k in row.keys())
    per_feature: list[dict[str, object]] = []
    for feature_name in sorted(keys):
        baseline_values = [_normalize_feature_value(item.get(feature_name)) for item in baseline_payloads]
        recent_values = [_normalize_feature_value(item.get(feature_name)) for item in recent_payloads]
        drift_score = _distribution_distance(baseline_values, recent_values)
        threshold = float(threshold_by_feature.get(feature_name, default_threshold))
        status = "OK"
        if drift_score > (2.0 * threshold):
            status = "CRITICAL"
        elif drift_score > threshold:
            status = "WARN"
        per_feature.append(
            {
                "feature_name": feature_name,
                "drift_score": round(drift_score, 6),
                "threshold": round(threshold, 6),
                "status": status,
            }
        )
    top = sorted(per_feature, key=lambda item: float(item.get("drift_score", 0.0)), reverse=True)[:5]
    max_score = max((float(item.get("drift_score", 0.0)) for item in per_feature), default=0.0)
    return (per_feature, top, max_score)


def _load_outcome_means(
    db: Session,
    *,
    tenant_id: int,
    experiment_key: str | None,
    baseline_from: datetime,
    baseline_to: datetime,
    recent_from: datetime,
    recent_to: datetime,
) -> tuple[float, float]:
    params = {
        "tenant_id": tenant_id,
        "baseline_from": baseline_from,
        "baseline_to": baseline_to,
        "recent_from": recent_from,
        "recent_to": recent_to,
        "experiment_key": (experiment_key or ""),
    }
    baseline = db.execute(
        text(
            """
            SELECT ROUND(AVG((e.payload->>'shadow_reward_score')::numeric), 6)::float AS avg_score
            FROM event_log e
            WHERE e.tenant_id = :tenant_id
              AND e.type = 'experiment_shadow_reward_computed'
              AND e.created_at >= :baseline_from
              AND e.created_at < :baseline_to
              AND (:experiment_key = '' OR COALESCE(e.payload->>'experiment_key', '') = :experiment_key)
              AND (e.payload->>'shadow_reward_score') ~ '^[0-9]+(\\.[0-9]+)?$'
            """
        ),
        params,
    ).mappings().first()
    recent = db.execute(
        text(
            """
            SELECT ROUND(AVG((e.payload->>'shadow_reward_score')::numeric), 6)::float AS avg_score
            FROM event_log e
            WHERE e.tenant_id = :tenant_id
              AND e.type = 'experiment_shadow_reward_computed'
              AND e.created_at >= :recent_from
              AND e.created_at < :recent_to
              AND (:experiment_key = '' OR COALESCE(e.payload->>'experiment_key', '') = :experiment_key)
              AND (e.payload->>'shadow_reward_score') ~ '^[0-9]+(\\.[0-9]+)?$'
            """
        ),
        params,
    ).mappings().first()
    return (float((baseline or {}).get("avg_score") or 0.0), float((recent or {}).get("avg_score") or 0.0))


def evaluate_drift_status(
    db: Session,
    *,
    tenant_id: int,
    experiment_key: str | None = "nba_retention_v1",
) -> AxionDriftStatus:
    now = datetime.now(UTC)
    recent_from = now - timedelta(days=1)
    baseline_from = now - timedelta(days=8)
    baseline_to = recent_from

    baseline_signatures = _load_feature_signatures(
        db,
        tenant_id=tenant_id,
        time_from=baseline_from,
        time_to=baseline_to,
    )
    recent_signatures = _load_feature_signatures(
        db,
        tenant_id=tenant_id,
        time_from=recent_from,
        time_to=now,
    )
    feature_drift_score = _distribution_distance(baseline_signatures, recent_signatures)
    baseline_payloads = _load_feature_payloads(
        db,
        tenant_id=tenant_id,
        time_from=baseline_from,
        time_to=baseline_to,
    )
    recent_payloads = _load_feature_payloads(
        db,
        tenant_id=tenant_id,
        time_from=recent_from,
        time_to=now,
    )

    baseline_reward_avg, recent_reward_avg = _load_outcome_means(
        db,
        tenant_id=tenant_id,
        experiment_key=experiment_key,
        baseline_from=baseline_from,
        baseline_to=baseline_to,
        recent_from=recent_from,
        recent_to=now,
    )
    if baseline_reward_avg <= 0:
        outcome_drift_pct = 0.0
    else:
        outcome_drift_pct = abs((recent_reward_avg - baseline_reward_avg) / baseline_reward_avg) * 100.0

    feature_threshold = max(0.0, float(settings.axion_feature_drift_warn_threshold))
    outcome_threshold = max(0.0, float(settings.axion_outcome_drift_warn_pct))
    thresholds_by_feature = _resolve_feature_thresholds()
    per_feature_drift, top_drifting_features, max_per_feature_drift = _compute_per_feature_drift(
        baseline_payloads,
        recent_payloads,
        default_threshold=feature_threshold,
        threshold_by_feature=thresholds_by_feature,
    )
    overall_feature_drift = max(feature_drift_score, max_per_feature_drift)

    status_label = "OK"
    if overall_feature_drift > (2.0 * feature_threshold) or outcome_drift_pct > (2.0 * outcome_threshold):
        status_label = "CRITICAL"
    elif overall_feature_drift > feature_threshold or outcome_drift_pct > outcome_threshold:
        status_label = "WARN"

    return AxionDriftStatus(
        status=status_label,
        feature_drift_score=round(overall_feature_drift, 6),
        outcome_drift_pct=round(outcome_drift_pct, 6),
        baseline_feature_samples=len(baseline_signatures),
        recent_feature_samples=len(recent_signatures),
        baseline_reward_avg=round(baseline_reward_avg, 6),
        recent_reward_avg=round(recent_reward_avg, 6),
        per_feature_drift=per_feature_drift,
        top_drifting_features=top_drifting_features,
    )
