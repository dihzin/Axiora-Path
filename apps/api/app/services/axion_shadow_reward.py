from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AxionRewardContract, EventLog
from app.services.axion_retention import AxionRetentionFilters, get_axion_retention_metrics

_DEFAULT_V1_WEIGHTS: dict[str, float] = {
    "w1": 0.4,
    "w2": 0.3,
    "w3": 0.3,
    "w4": 0.0,
    "w5": 0.0,
}


def _active_reward_contract(db: Session) -> tuple[int, dict[str, float]]:
    if hasattr(db, "scalar"):
        contract = db.scalar(
            select(AxionRewardContract)
            .where(AxionRewardContract.active.is_(True))
            .order_by(AxionRewardContract.version.desc())
            .limit(1)
        )
        if contract is not None:
            raw_weights = dict(contract.weights_json or {})
            return (
                int(contract.version),
                {
                    "w1": float(raw_weights.get("w1", _DEFAULT_V1_WEIGHTS["w1"])),
                    "w2": float(raw_weights.get("w2", _DEFAULT_V1_WEIGHTS["w2"])),
                    "w3": float(raw_weights.get("w3", _DEFAULT_V1_WEIGHTS["w3"])),
                    "w4": float(raw_weights.get("w4", _DEFAULT_V1_WEIGHTS["w4"])),
                    "w5": float(raw_weights.get("w5", _DEFAULT_V1_WEIGHTS["w5"])),
                },
            )
    return (1, dict(_DEFAULT_V1_WEIGHTS))


def compute_shadow_reward(
    db: Session,
    *,
    experiment_key: str,
    tenant_id: int,
) -> dict[str, float | str]:
    metrics = get_axion_retention_metrics(
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
        ),
    )
    session_completed_rate = float(metrics.get("cta_to_session_conversion", 0.0) or 0.0)
    retention_d1_rate = float(metrics.get("d1_rate", 0.0) or 0.0)
    retention_d7_rate = float(metrics.get("d7_rate", 0.0) or 0.0)
    session_frequency = float(metrics.get("session_frequency", 0.0) or 0.0)
    churn_signal = max(0.0, 100.0 - retention_d7_rate)
    inactivity_decay = max(0.0, 100.0 - min(100.0, session_frequency * 20.0))
    contract_version, weights = _active_reward_contract(db)

    score_0_100 = (
        (weights["w1"] * session_completed_rate)
        + (weights["w2"] * retention_d1_rate)
        + (weights["w3"] * retention_d7_rate)
        - (weights["w4"] * churn_signal)
        - (weights["w5"] * inactivity_decay)
    )
    now_iso = datetime.now(UTC).isoformat()

    db.add(
        EventLog(
            tenant_id=tenant_id,
            actor_user_id=None,
            child_id=None,
            type="experiment_shadow_reward_computed",
            payload={
                "experiment_key": experiment_key,
                "shadow_reward_score": round(score_0_100, 4),
                "metric_snapshot": {
                    "session_completed_rate": round(session_completed_rate, 4),
                    "retention_d1_rate": round(retention_d1_rate, 4),
                    "retention_d7_rate": round(retention_d7_rate, 4),
                    "churn_signal": round(churn_signal, 4),
                    "inactivity_decay": round(inactivity_decay, 4),
                    "weights": weights,
                    "reward_contract_version": contract_version,
                },
                "timestamp": now_iso,
            },
        )
    )
    db.commit()
    return {
        "shadow_reward_score": round(score_0_100, 4),
        "timestamp": now_iso,
    }
