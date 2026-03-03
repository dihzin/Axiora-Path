from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AxionDecision, AxionFeatureRegistry, ChildProfile, GameSession, LearningSession, Membership, Tenant, UserLearningStreak
from app.services.child_age import get_child_age

FEATURE_VECTOR_ORDER_V1: tuple[str, ...] = (
    "age_bucket",
    "plan_type",
    "streak_length",
    "last_session_gap",
    "historical_completion_rate",
    "historical_retention_rate",
)


def _resolve_feature_version(db: Session) -> int:
    version = db.scalar(
        select(AxionFeatureRegistry.version)
        .where(AxionFeatureRegistry.active.is_(True))
        .order_by(AxionFeatureRegistry.version.desc())
        .limit(1)
    )
    if version is None:
        return 1
    return max(1, int(version))


def _resolve_tenant_id(db: Session, *, user_id: int) -> int | None:
    tenant_id = db.scalar(
        select(Membership.tenant_id)
        .where(Membership.user_id == user_id)
        .order_by(Membership.id.asc())
        .limit(1)
    )
    return int(tenant_id) if tenant_id is not None else None


def _resolve_plan_type(db: Session, *, tenant_id: int | None) -> str:
    if tenant_id is None:
        return "UNKNOWN"
    plan_name = db.scalar(select(Tenant.plan_name).where(Tenant.id == tenant_id))
    return str(plan_name or "FREE").upper()


def _resolve_age_bucket(db: Session, *, user_id: int, experiment_key: str | None) -> str:
    decision_stmt = (
        select(AxionDecision.child_id)
        .where(
            AxionDecision.user_id == user_id,
            AxionDecision.child_id.is_not(None),
        )
        .order_by(AxionDecision.created_at.desc())
        .limit(1)
    )
    if experiment_key:
        decision_stmt = decision_stmt.where(AxionDecision.experiment_key == experiment_key)
    child_id = db.scalar(decision_stmt)
    if child_id is None:
        return "unknown"
    date_of_birth = db.scalar(select(ChildProfile.date_of_birth).where(ChildProfile.id == int(child_id)))
    if date_of_birth is None:
        return "unknown"
    age = get_child_age(date_of_birth, today=datetime.now(UTC).date())
    if age <= 8:
        return "6_8"
    if age <= 12:
        return "9_12"
    return "13_plus"


def _resolve_streak_length(db: Session, *, user_id: int) -> int:
    value = db.scalar(select(UserLearningStreak.current_streak).where(UserLearningStreak.user_id == user_id))
    return max(0, int(value or 0))


def _resolve_last_session_gap_days(db: Session, *, user_id: int) -> int:
    last_learning = db.scalar(select(func.max(LearningSession.started_at)).where(LearningSession.user_id == user_id))
    last_game = db.scalar(select(func.max(GameSession.created_at)).where(GameSession.user_id == user_id))
    last_seen: datetime | None = None
    if isinstance(last_learning, datetime):
        last_seen = last_learning
    if isinstance(last_game, datetime) and (last_seen is None or last_game > last_seen):
        last_seen = last_game
    if last_seen is None:
        return 999
    return max(0, int((datetime.now(UTC) - last_seen).total_seconds() // 86400))


def _resolve_historical_completion_rate(db: Session, *, user_id: int, lookback_days: int = 30) -> float:
    started_after = datetime.now(UTC) - timedelta(days=max(1, int(lookback_days)))
    started_count = int(
        db.scalar(
            select(func.count(LearningSession.id)).where(
                LearningSession.user_id == user_id,
                LearningSession.started_at >= started_after,
            )
        )
        or 0
    )
    completed_count = int(
        db.scalar(
            select(func.count(LearningSession.id)).where(
                LearningSession.user_id == user_id,
                LearningSession.started_at >= started_after,
                LearningSession.ended_at.is_not(None),
            )
        )
        or 0
    )
    if started_count <= 0:
        return 0.0
    return max(0.0, min(1.0, float(completed_count) / float(started_count)))


def _resolve_historical_retention_rate(db: Session, *, user_id: int, lookback_days: int = 30) -> float:
    started_after = datetime.now(UTC) - timedelta(days=max(1, int(lookback_days)))
    active_days = int(
        db.scalar(
            select(func.count(func.distinct(func.date(LearningSession.started_at)))).where(
                LearningSession.user_id == user_id,
                LearningSession.started_at >= started_after,
            )
        )
        or 0
    )
    return max(0.0, min(1.0, float(active_days) / float(max(1, int(lookback_days)))))


def build_feature_vector(
    db: Session,
    user_id: int,
    experiment_key: str | None,
) -> dict[str, object]:
    feature_version = _resolve_feature_version(db)
    tenant_id = _resolve_tenant_id(db, user_id=user_id)

    features: dict[str, object] = {
        "age_bucket": _resolve_age_bucket(db, user_id=user_id, experiment_key=experiment_key),
        "plan_type": _resolve_plan_type(db, tenant_id=tenant_id),
        "streak_length": _resolve_streak_length(db, user_id=user_id),
        "last_session_gap": _resolve_last_session_gap_days(db, user_id=user_id),
        "historical_completion_rate": round(_resolve_historical_completion_rate(db, user_id=user_id), 6),
        "historical_retention_rate": round(_resolve_historical_retention_rate(db, user_id=user_id), 6),
    }
    ordered_values = [features[name] for name in FEATURE_VECTOR_ORDER_V1]
    return {
        "feature_version": feature_version,
        "feature_order": list(FEATURE_VECTOR_ORDER_V1),
        "feature_values": ordered_values,
        "features": features,
        "metadata": {
            "user_id": int(user_id),
            "experiment_key": experiment_key,
            "tenant_id": tenant_id,
        },
    }
