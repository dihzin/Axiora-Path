from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import AxionShadowPolicyCandidate
from app.services.axion_retention import AxionRetentionFilters, get_axion_retention_metrics


def _next_policy_version(db: Session, *, tenant_id: int, experiment_key: str) -> int:
    version = db.scalar(
        select(func.max(AxionShadowPolicyCandidate.policy_version)).where(
            AxionShadowPolicyCandidate.tenant_id == tenant_id,
            AxionShadowPolicyCandidate.experiment_key == experiment_key,
        )
    )
    if version is None:
        return 1
    return max(1, int(version) + 1)


def _load_feature_snapshot_inputs(db: Session, *, tenant_id: int, experiment_key: str) -> tuple[int, float]:
    row = db.execute(
        text(
            """
            SELECT
                COUNT(*)::int AS sample_count,
                COALESCE(
                    AVG(
                        CASE
                            WHEN COALESCE(features_json->>'nba_enabled_final', 'false') = 'true' THEN 1.0
                            ELSE 0.0
                        END
                    ),
                    0.0
                )::float AS nba_enabled_ratio
            FROM axion_feature_snapshot
            WHERE tenant_id = :tenant_id
              AND experiment_key = :experiment_key
              AND snapshot_at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days'
            """
        ),
        {"tenant_id": tenant_id, "experiment_key": experiment_key},
    ).mappings().first()
    if row is None:
        return (0, 0.0)
    return (int(row.get("sample_count") or 0), float(row.get("nba_enabled_ratio") or 0.0))


def _load_latest_shadow_reward(db: Session, *, tenant_id: int, experiment_key: str) -> float:
    row = db.execute(
        text(
            """
            SELECT (payload->>'shadow_reward_score')::numeric AS score
            FROM event_log
            WHERE tenant_id = :tenant_id
              AND type = 'experiment_shadow_reward_computed'
              AND COALESCE(payload->>'experiment_key', '') = :experiment_key
            ORDER BY created_at DESC
            LIMIT 1
            """
        ),
        {"tenant_id": tenant_id, "experiment_key": experiment_key},
    ).mappings().first()
    if row is None or row.get("score") is None:
        return 0.0
    return float(row["score"])


def compute_shadow_policy(
    db: Session,
    *,
    experiment_key: str,
    tenant_id: int,
) -> dict[str, object]:
    feature_samples, nba_enabled_ratio = _load_feature_snapshot_inputs(db, tenant_id=tenant_id, experiment_key=experiment_key)
    shadow_reward = _load_latest_shadow_reward(db, tenant_id=tenant_id, experiment_key=experiment_key)
    retention = get_axion_retention_metrics(
        db,
        filters=AxionRetentionFilters(
            tenant_id=tenant_id,
            action_type=None,
            context=None,
            persona=None,
            experiment_key=experiment_key,
            variant=None,
            nba_reason=None,
            destination=None,
            dedupe_exposure_per_day=True,
            lookback_days=30,
            date_from=(datetime.now(UTC) - timedelta(days=30)).date(),
            date_to=datetime.now(UTC).date(),
        ),
    )
    cohort_users = int(retention.get("cohort_users", 0) or 0)
    d7_rate = float(retention.get("d7_rate", 0.0) or 0.0)
    cta_started = float(retention.get("cta_to_session_started_conversion", 0.0) or 0.0)

    # Shadow-only heuristic candidate. No online serving impact.
    expected_lift = (
        (0.45 * (shadow_reward / 100.0))
        + (0.35 * (d7_rate / 100.0))
        + (0.20 * (cta_started / 100.0))
    )
    confidence_score = (
        min(1.0, feature_samples / 500.0) * 0.45
        + min(1.0, cohort_users / 500.0) * 0.45
        + min(1.0, shadow_reward / 100.0) * 0.10
    )

    policy_version = _next_policy_version(db, tenant_id=tenant_id, experiment_key=experiment_key)
    weight_vector_json = {
        "weights": {
            "shadow_reward": 0.45,
            "retention_d7": 0.35,
            "cta_to_session_started": 0.20,
        },
        "inputs": {
            "feature_samples_30d": feature_samples,
            "nba_enabled_ratio_30d": round(nba_enabled_ratio, 4),
            "shadow_reward_score": round(shadow_reward, 4),
            "retention_d7_rate": round(d7_rate, 4),
            "cta_to_session_started_rate": round(cta_started, 4),
        },
    }
    candidate = AxionShadowPolicyCandidate(
        tenant_id=tenant_id,
        experiment_key=experiment_key,
        policy_version=policy_version,
        weight_vector_json=weight_vector_json,
        expected_lift=round(expected_lift, 4),
        confidence_score=round(confidence_score, 4),
        created_at=datetime.now(UTC),
    )
    db.add(candidate)
    db.commit()
    return {
        "experiment_key": experiment_key,
        "policy_version": int(policy_version),
        "weight_vector_json": weight_vector_json,
        "expected_lift": float(round(expected_lift, 4)),
        "confidence_score": float(round(confidence_score, 4)),
        "created_at": candidate.created_at,
    }
