from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AxionChildProfile, ChildProfile, Membership, UserLearningStreak

FEATURE_SET_VERSION = 1


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _ema(current: float, observed: float, *, alpha: float = 0.22) -> float:
    return _clamp((1.0 - alpha) * _clamp(current) + alpha * _clamp(observed))


def resolve_child_for_user(db: Session, *, user_id: int, tenant_id: int | None = None) -> int | None:
    if tenant_id is not None:
        child_id = db.scalar(
            select(ChildProfile.id)
            .where(
                ChildProfile.tenant_id == tenant_id,
                ChildProfile.deleted_at.is_(None),
            )
            .order_by(ChildProfile.id.asc())
            .limit(1)
        )
        if child_id is not None:
            return int(child_id)

    tenant_ids = db.scalars(select(Membership.tenant_id).where(Membership.user_id == user_id)).all()
    if not tenant_ids:
        return None
    child_id = db.scalar(
        select(ChildProfile.id)
        .where(
            ChildProfile.tenant_id.in_(tenant_ids),
            ChildProfile.deleted_at.is_(None),
        )
        .order_by(ChildProfile.id.asc())
        .limit(1)
    )
    return int(child_id) if child_id is not None else None


def get_or_create_axion_child_profile(db: Session, *, child_id: int) -> AxionChildProfile:
    row = db.get(AxionChildProfile, child_id)
    if row is not None:
        return row
    row = AxionChildProfile(
        child_id=child_id,
        mastery_score=0,
        frustration_index=0,
        engagement_score=0,
        streak_stability=0,
        risk_of_churn=0,
        confidence_score=0,
        version=FEATURE_SET_VERSION,
    )
    db.add(row)
    db.flush()
    return row


def update_axion_child_profile_after_session(
    db: Session,
    *,
    child_id: int,
    accuracy: float,
    total_questions: int,
    confidence_score: float,
    frustration_score: float,
    risk_of_churn: float,
    streak_days: int,
) -> AxionChildProfile:
    row = get_or_create_axion_child_profile(db, child_id=child_id)

    safe_total = max(1, int(total_questions))
    mastery_observed = _clamp(accuracy)
    frustration_observed = _clamp((1.0 - float(accuracy)) * 0.6 + float(frustration_score) * 0.4)
    confidence_observed = _clamp(confidence_score)
    engagement_observed = _clamp((safe_total / 10.0) * 0.4 + mastery_observed * 0.6)
    streak_observed = _clamp(min(max(0, int(streak_days)), 30) / 30.0)
    churn_observed = _clamp(risk_of_churn)

    row.mastery_score = _ema(float(row.mastery_score), mastery_observed)
    row.frustration_index = _ema(float(row.frustration_index), frustration_observed)
    row.confidence_score = _ema(float(row.confidence_score), confidence_observed)
    row.engagement_score = _ema(float(row.engagement_score), engagement_observed)
    row.streak_stability = _ema(float(row.streak_stability), streak_observed)
    row.risk_of_churn = _ema(float(row.risk_of_churn), churn_observed)
    row.version = FEATURE_SET_VERSION
    row.last_updated_at = datetime.now(UTC)
    db.flush()
    return row


def axion_child_profile_snapshot(
    db: Session,
    *,
    child_id: int | None = None,
    user_id: int | None = None,
    tenant_id: int | None = None,
) -> dict[str, Any] | None:
    resolved_child_id = child_id
    if resolved_child_id is None and user_id is not None:
        resolved_child_id = resolve_child_for_user(db, user_id=user_id, tenant_id=tenant_id)
    if resolved_child_id is None:
        return None
    row = db.get(AxionChildProfile, int(resolved_child_id))
    if row is None:
        return None
    return {
        "childId": int(row.child_id),
        "masteryScore": round(float(row.mastery_score), 4),
        "frustrationIndex": round(float(row.frustration_index), 4),
        "engagementScore": round(float(row.engagement_score), 4),
        "streakStability": round(float(row.streak_stability), 4),
        "riskOfChurn": round(float(row.risk_of_churn), 4),
        "confidenceScore": round(float(row.confidence_score), 4),
        "lastUpdatedAt": row.last_updated_at.isoformat() if row.last_updated_at else None,
        "version": int(row.version),
    }


def current_streak_days(db: Session, *, user_id: int) -> int:
    value = db.scalar(select(UserLearningStreak.current_streak).where(UserLearningStreak.user_id == user_id))
    return max(0, int(value or 0))
