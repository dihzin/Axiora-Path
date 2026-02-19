from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import UserLearningStreak
from app.services.achievement_engine import unlock_achievement_by_slug
from app.services.gamification import get_or_create_game_profile

LEARNING_STREAK_7_BONUS_COINS = 30


@dataclass(slots=True)
class LearningStreakSnapshot:
    current_streak: int
    longest_streak: int
    last_lesson_date: datetime | None
    bonus_coins_granted: int
    unlocked_30_day_badge: bool


def _get_or_create_learning_streak(db: Session, *, user_id: int) -> UserLearningStreak:
    row = db.scalar(select(UserLearningStreak).where(UserLearningStreak.user_id == user_id))
    if row is not None:
        return row
    row = UserLearningStreak(
        user_id=user_id,
        current_streak=0,
        longest_streak=0,
        last_lesson_date=None,
    )
    db.add(row)
    db.flush()
    return row


def get_learning_streak(db: Session, *, user_id: int) -> LearningStreakSnapshot:
    row = _get_or_create_learning_streak(db, user_id=user_id)
    return LearningStreakSnapshot(
        current_streak=row.current_streak,
        longest_streak=row.longest_streak,
        last_lesson_date=(
            datetime.combine(row.last_lesson_date, datetime.min.time(), tzinfo=UTC)
            if row.last_lesson_date is not None
            else None
        ),
        bonus_coins_granted=0,
        unlocked_30_day_badge=False,
    )


def register_learning_lesson_completion(
    db: Session, *, user_id: int, completion_at: datetime | None = None
) -> LearningStreakSnapshot:
    row = _get_or_create_learning_streak(db, user_id=user_id)
    profile = get_or_create_game_profile(db, user_id=user_id)
    now = completion_at or datetime.now(UTC)
    today = now.date()

    bonus_coins_granted = 0
    unlocked_badge = False

    if row.last_lesson_date is None:
        row.current_streak = 1
    else:
        gap = (today - row.last_lesson_date).days
        if gap == 0:
            return LearningStreakSnapshot(
                current_streak=row.current_streak,
                longest_streak=row.longest_streak,
                last_lesson_date=(
                    datetime.combine(row.last_lesson_date, datetime.min.time(), tzinfo=UTC)
                    if row.last_lesson_date is not None
                    else None
                ),
                bonus_coins_granted=0,
                unlocked_30_day_badge=False,
            )
        if gap == 1:
            row.current_streak += 1
        else:
            row.current_streak = 1

    row.last_lesson_date = today
    row.longest_streak = max(row.longest_streak, row.current_streak)

    if row.current_streak == 7:
        profile.axion_coins += LEARNING_STREAK_7_BONUS_COINS
        bonus_coins_granted = LEARNING_STREAK_7_BONUS_COINS

    if row.current_streak >= 30:
        unlocked_badge = unlock_achievement_by_slug(
            db,
            user_id=user_id,
            profile=profile,
            slug="learning_streak_30_days",
        )

    db.flush()
    return LearningStreakSnapshot(
        current_streak=row.current_streak,
        longest_streak=row.longest_streak,
        last_lesson_date=(
            datetime.combine(row.last_lesson_date, datetime.min.time(), tzinfo=UTC)
            if row.last_lesson_date is not None
            else None
        ),
        bonus_coins_granted=bonus_coins_granted,
        unlocked_30_day_badge=unlocked_badge,
    )
