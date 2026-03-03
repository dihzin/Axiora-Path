from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AxionPolicyStateHistory

POLICY_STATE_SHADOW = "SHADOW"
POLICY_STATE_CANARY = "CANARY"
POLICY_STATE_ACTIVE = "ACTIVE"
POLICY_STATE_ROLLED_BACK = "ROLLED_BACK"

ALLOWED_POLICY_TRANSITIONS: dict[str, set[str]] = {
    POLICY_STATE_SHADOW: {POLICY_STATE_CANARY},
    POLICY_STATE_CANARY: {POLICY_STATE_ACTIVE, POLICY_STATE_ROLLED_BACK},
    POLICY_STATE_ACTIVE: {POLICY_STATE_ROLLED_BACK},
    POLICY_STATE_ROLLED_BACK: set(),
}


@dataclass(slots=True)
class PolicyTransitionResult:
    experiment_key: str
    previous_state: str
    current_state: str
    changed_at: datetime
    history_id: str | None


def get_current_policy_state(db: Session, *, tenant_id: int, experiment_key: str) -> str:
    value = db.scalar(
        select(AxionPolicyStateHistory.to_state)
        .where(
            AxionPolicyStateHistory.tenant_id == tenant_id,
            AxionPolicyStateHistory.experiment_key == experiment_key,
        )
        .order_by(AxionPolicyStateHistory.changed_at.desc(), AxionPolicyStateHistory.id.desc())
        .limit(1)
    )
    normalized = str(value or "").strip().upper()
    if normalized in ALLOWED_POLICY_TRANSITIONS:
        return normalized
    return POLICY_STATE_SHADOW


def get_current_policy_rollout_percentage(db: Session, *, tenant_id: int, experiment_key: str) -> int | None:
    value = db.scalar(
        select(AxionPolicyStateHistory.rollout_percentage)
        .where(
            AxionPolicyStateHistory.tenant_id == tenant_id,
            AxionPolicyStateHistory.experiment_key == experiment_key,
            AxionPolicyStateHistory.rollout_percentage.is_not(None),
        )
        .order_by(AxionPolicyStateHistory.changed_at.desc(), AxionPolicyStateHistory.id.desc())
        .limit(1)
    )
    if value is None:
        return None
    return max(0, min(100, int(value)))


def transition_policy_state(
    db: Session,
    *,
    tenant_id: int,
    experiment_key: str,
    to_state: str,
    actor_user_id: int | None,
    reason: str | None = None,
    rollout_percentage: int | None = None,
    auto_commit: bool = True,
) -> PolicyTransitionResult:
    target = str(to_state or "").strip().upper()
    if target not in ALLOWED_POLICY_TRANSITIONS:
        raise ValueError("invalid_target_state")

    previous = get_current_policy_state(db, tenant_id=tenant_id, experiment_key=experiment_key)
    if target == previous:
        raise ValueError("no_state_change")
    allowed = ALLOWED_POLICY_TRANSITIONS.get(previous, set())
    if target not in allowed:
        raise ValueError(f"invalid_transition:{previous}->{target}")

    normalized_rollout = None
    if rollout_percentage is not None:
        normalized_rollout = int(rollout_percentage)
        if normalized_rollout < 0 or normalized_rollout > 100:
            raise ValueError("invalid_rollout_percentage")

    row = AxionPolicyStateHistory(
        tenant_id=tenant_id,
        experiment_key=experiment_key,
        from_state=previous,
        to_state=target,
        actor_user_id=actor_user_id,
        reason=(reason or None),
        rollout_percentage=normalized_rollout,
        changed_at=datetime.now(UTC),
    )
    db.add(row)
    if hasattr(db, "flush"):
        db.flush()
    if auto_commit:
        db.commit()
    return PolicyTransitionResult(
        experiment_key=experiment_key,
        previous_state=previous,
        current_state=target,
        changed_at=row.changed_at,
        history_id=getattr(row, "id", None),
    )
