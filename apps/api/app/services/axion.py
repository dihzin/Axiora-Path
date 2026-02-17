from __future__ import annotations

import hashlib
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import AxionProfile, DailyMood, MoodType, Streak, TaskLog, TaskLogStatus
from app.models import ChildProfile, SavingGoal
from app.services.avatar import compute_avatar_stage
from app.services.axion_emotion import AxionEmotionInput, AxionEmotionService
from app.services.goals import calculate_saved_total_for_child

_TRAITS_POOL = [
    "curious",
    "brave",
    "kind",
    "focused",
    "playful",
    "resilient",
    "creative",
    "patient",
    "adventurous",
]


def _build_traits(personality_seed: str, stage: int, mood_state: str) -> list[str]:
    digest = hashlib.sha256(personality_seed.encode("utf-8")).digest()
    base_index = digest[0] % len(_TRAITS_POOL)
    step = (digest[1] % (len(_TRAITS_POOL) - 1)) + 1
    trait_indexes = [(base_index + i * step) % len(_TRAITS_POOL) for i in range(3)]
    traits = [_TRAITS_POOL[index] for index in trait_indexes]
    traits.append(f"stage_{stage}")
    traits.append(mood_state.lower())
    return traits


def ensure_axion_profile(
    db: Session,
    *,
    child_id: int,
) -> AxionProfile:
    profile = db.get(AxionProfile, child_id)
    if profile is not None:
        return profile
    profile = AxionProfile(
        child_id=child_id,
        stage=1,
        mood_state="NEUTRAL",
        personality_seed=f"axion-{child_id}",
        last_interaction_at=None,
    )
    db.add(profile)
    db.flush()
    return profile


def compute_axion_state(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    xp_total: int,
) -> tuple[AxionProfile, list[str]]:
    profile = ensure_axion_profile(db, child_id=child_id)

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    weekly_counts = db.execute(
        select(
            func.count(TaskLog.id),
            func.coalesce(func.sum(case((TaskLog.status == TaskLogStatus.APPROVED, 1), else_=0)), 0),
        ).where(
            TaskLog.tenant_id == tenant_id,
            TaskLog.child_id == child_id,
            TaskLog.date >= week_start,
            TaskLog.date <= week_end,
        ),
    ).one()
    total = int(weekly_counts[0] or 0)
    approved = int(weekly_counts[1] or 0)
    completion_rate = (approved / total * 100) if total > 0 else 0.0

    streak = db.get(Streak, child_id)
    streak_count = streak.current if streak is not None else 0

    latest_mood = db.scalar(
        select(DailyMood.mood).where(DailyMood.child_id == child_id).order_by(DailyMood.date.desc()).limit(1),
    )

    latest_log_date = db.scalar(select(func.max(TaskLog.date)).where(TaskLog.tenant_id == tenant_id, TaskLog.child_id == child_id))
    inactivity_days = (today - latest_log_date).days if latest_log_date is not None else 999

    active_goal = db.scalar(
        select(SavingGoal)
        .where(
            SavingGoal.tenant_id == tenant_id,
            SavingGoal.child_id == child_id,
        )
        .order_by(SavingGoal.created_at.desc(), SavingGoal.id.desc())
        .limit(1),
    )
    goal_progress_percent = 0.0
    if active_goal is not None and active_goal.target_cents > 0:
        saved_total = calculate_saved_total_for_child(db, tenant_id=tenant_id, child_id=child_id)
        goal_progress_percent = (saved_total / active_goal.target_cents) * 100

    emotion = AxionEmotionService()
    profile.stage = compute_avatar_stage(xp_total)
    profile.mood_state = emotion.resolve(
        AxionEmotionInput(
            streak=streak_count,
            weekly_completion_rate=completion_rate,
            last_mood=latest_mood,
            goal_progress_percent=goal_progress_percent,
            inactivity_days=inactivity_days,
        ),
    )
    profile.last_interaction_at = datetime.now(UTC)

    traits = _build_traits(
        personality_seed=profile.personality_seed,
        stage=profile.stage,
        mood_state=profile.mood_state,
    )
    return profile, traits


def refresh_axion_mood_states_daily(db: Session) -> int:
    children = db.scalars(
        select(ChildProfile).where(ChildProfile.deleted_at.is_(None)).order_by(ChildProfile.id.asc()),
    ).all()
    updated = 0
    for child in children:
        compute_axion_state(
            db,
            tenant_id=child.tenant_id,
            child_id=child.id,
            xp_total=child.xp_total,
        )
        updated += 1
    return updated
