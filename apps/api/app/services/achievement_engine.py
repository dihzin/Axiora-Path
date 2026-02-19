from __future__ import annotations

from datetime import UTC, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Achievement,
    GameSession,
    GameType,
    Lesson,
    LessonProgress,
    Subject,
    Unit,
    UserAchievement,
    UserGameProfile,
)


def _calculate_level(xp: int) -> int:
    safe_xp = max(0, xp)
    return (safe_xp // 100) + 1


DEFAULT_ACHIEVEMENTS: list[dict[str, Any]] = [
    {
        "slug": "first_win",
        "name": "First Win",
        "description": "Conquiste sua primeira vitória no Jogo da Velha.",
        "icon": "trophy",
        "xp_reward": 20,
        "coin_reward": 5,
        "badge_key": "badge_first_win",
        "condition_type": "first_win_tictactoe",
        "condition_value": 1,
    },
    {
        "slug": "wins_streak_3",
        "name": "3 Wins Streak",
        "description": "Ganhe 3 partidas seguidas no Jogo da Velha.",
        "icon": "flame",
        "xp_reward": 30,
        "coin_reward": 8,
        "badge_key": "badge_win_streak_3",
        "condition_type": "tictactoe_win_streak",
        "condition_value": 3,
    },
    {
        "slug": "xp_100_reached",
        "name": "100 XP reached",
        "description": "Alcance 100 XP totais.",
        "icon": "sparkles",
        "xp_reward": 25,
        "coin_reward": 5,
        "badge_key": "badge_xp_100",
        "condition_type": "xp_reached",
        "condition_value": 100,
    },
    {
        "slug": "first_finance_master",
        "name": "First Finance Master rating",
        "description": "Alcance rating Financial Master no Mesada Inteligente.",
        "icon": "piggy-bank",
        "xp_reward": 35,
        "coin_reward": 10,
        "badge_key": "badge_finance_master",
        "condition_type": "finance_master_rating",
        "condition_value": 1,
    },
    {
        "slug": "learning_first_lesson_completed",
        "name": "First Lesson Completed",
        "description": "Conclua sua primeira lição no Aprender.",
        "icon": "book-open",
        "xp_reward": 20,
        "coin_reward": 8,
        "badge_key": "badge_learning_first",
        "condition_type": "learning_first_lesson_completed",
        "condition_value": 1,
    },
    {
        "slug": "learning_streak_7_days",
        "name": "7 Days Learning Streak",
        "description": "Aprenda por 7 dias consecutivos.",
        "icon": "calendar-check",
        "xp_reward": 50,
        "coin_reward": 20,
        "badge_key": "badge_learning_streak_7",
        "condition_type": "learning_streak_days",
        "condition_value": 7,
    },
    {
        "slug": "learning_streak_30_days",
        "name": "30 Days Learning Streak",
        "description": "Mantenha uma sequencia de 30 dias no Aprender.",
        "icon": "flame",
        "xp_reward": 0,
        "coin_reward": 0,
        "badge_key": "badge_learning_streak_30",
        "condition_type": "learning_streak_days",
        "condition_value": 30,
    },
    {
        "slug": "learning_math_100_xp",
        "name": "100 XP in Mathematics",
        "description": "Acumule 100 XP em Matemática.",
        "icon": "calculator",
        "xp_reward": 40,
        "coin_reward": 18,
        "badge_key": "badge_math_100_xp",
        "condition_type": "learning_math_xp_reached",
        "condition_value": 100,
    },
    {
        "slug": "learning_perfect_score_3_stars",
        "name": "Perfect Score (3 stars)",
        "description": "Conclua uma lição com 3 estrelas.",
        "icon": "star",
        "xp_reward": 30,
        "coin_reward": 12,
        "badge_key": "badge_perfect_score",
        "condition_type": "learning_perfect_score",
        "condition_value": 1,
    },
]


def ensure_default_achievements(db: Session) -> None:
    for item in DEFAULT_ACHIEVEMENTS:
        existing = db.scalar(select(Achievement).where(Achievement.slug == str(item["slug"])))
        if existing is None:
            achievement = Achievement(
                slug=str(item["slug"]),
                title=str(item["name"]),
                name=str(item["name"]),
                description=str(item["description"]),
                icon=str(item["icon"]),
                icon_key=str(item["icon"]),
                xp_reward=int(item["xp_reward"]),
                coin_reward=int(item["coin_reward"]),
                badge_key=str(item["badge_key"]),
                condition_type=str(item["condition_type"]),
                condition_value=int(item["condition_value"]),
            )
            db.add(achievement)
            continue

        existing.title = str(item["name"])
        existing.name = str(item["name"])
        existing.description = str(item["description"])
        existing.icon = str(item["icon"])
        existing.icon_key = str(item["icon"])
        existing.xp_reward = int(item["xp_reward"])
        existing.coin_reward = int(item["coin_reward"])
        existing.badge_key = str(item["badge_key"])
        existing.condition_type = str(item["condition_type"])
        existing.condition_value = int(item["condition_value"])
    db.flush()


def _has_user_achievement(db: Session, *, user_id: int, achievement_id: int) -> bool:
    existing = db.scalar(
        select(UserAchievement).where(
            UserAchievement.user_id == user_id,
            UserAchievement.achievement_id == achievement_id,
        ),
    )
    return existing is not None


def _current_tictactoe_win_streak(db: Session, *, user_id: int) -> int:
    sessions = db.scalars(
        select(GameSession)
        .where(
            GameSession.user_id == user_id,
            GameSession.game_type == GameType.TICTACTOE,
        )
        .order_by(GameSession.created_at.desc()),
    ).all()
    streak = 0
    for session in sessions:
        if session.score >= 500:
            streak += 1
            continue
        break
    return streak


def _unlock(
    db: Session,
    *,
    user_id: int,
    profile: UserGameProfile,
    achievement: Achievement,
) -> bool:
    if _has_user_achievement(db, user_id=user_id, achievement_id=achievement.id):
        return False

    db.add(UserAchievement(user_id=user_id, achievement_id=achievement.id))
    bonus_xp = max(0, achievement.xp_reward)
    bonus_coins = max(0, achievement.coin_reward)
    if bonus_xp > 0:
        profile.xp += bonus_xp
        profile.level = _calculate_level(profile.xp)
    if bonus_coins > 0:
        profile.axion_coins += bonus_coins
    return True


def _normalize_subject_name(value: str) -> str:
    return (
        value.lower()
        .replace("á", "a")
        .replace("à", "a")
        .replace("â", "a")
        .replace("ã", "a")
        .replace("é", "e")
        .replace("ê", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ô", "o")
        .replace("õ", "o")
        .replace("ú", "u")
        .replace("ç", "c")
    )


def _completed_lessons_count(db: Session, *, user_id: int) -> int:
    rows = db.scalars(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id,
            LessonProgress.completed.is_(True),
        ),
    ).all()
    return len(rows)


def _learning_streak_days(db: Session, *, user_id: int) -> int:
    rows = db.scalars(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id,
            LessonProgress.completed.is_(True),
            LessonProgress.completed_at.is_not(None),
        ),
    ).all()
    days = sorted(
        {
            item.completed_at.astimezone(UTC).date()
            for item in rows
            if item.completed_at is not None
        },
        reverse=True,
    )
    if not days:
        return 0
    streak = 1
    for idx in range(len(days) - 1):
        if days[idx] - days[idx + 1] == timedelta(days=1):
            streak += 1
            continue
        break
    return streak


def _subject_xp_total(
    db: Session,
    *,
    user_id: int,
    accepted_subject_names: set[str],
) -> int:
    lessons = db.scalars(select(Lesson)).all()
    units = db.scalars(select(Unit)).all()
    subjects = db.scalars(select(Subject)).all()
    progress = db.scalars(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id,
            LessonProgress.completed.is_(True),
        ),
    ).all()

    unit_by_id = {unit.id: unit for unit in units}
    subject_by_id = {subject.id: subject for subject in subjects}
    lesson_by_id = {lesson.id: lesson for lesson in lessons}

    total = 0
    for item in progress:
        lesson = lesson_by_id.get(item.lesson_id)
        if lesson is None:
            continue
        unit = unit_by_id.get(lesson.unit_id)
        if unit is None:
            continue
        subject = subject_by_id.get(unit.subject_id)
        if subject is None:
            continue
        normalized = _normalize_subject_name(subject.name)
        if normalized in accepted_subject_names:
            total += max(0, item.xp_granted)
    return total


def evaluate_achievements_after_game(
    db: Session,
    *,
    user_id: int,
    profile: UserGameProfile,
    game_type: GameType,
    score: int,
) -> list[str]:
    ensure_default_achievements(db)
    unlocked_slugs: list[str] = []

    achievements = db.scalars(
        select(Achievement).where(
            Achievement.slug.in_(
                [
                    "first_win",
                    "wins_streak_3",
                    "xp_100_reached",
                    "first_finance_master",
                ],
            ),
        ),
    ).all()
    by_slug = {item.slug: item for item in achievements}

    first_win = by_slug.get("first_win")
    if first_win and game_type == GameType.TICTACTOE and score >= 500:
        if _unlock(db, user_id=user_id, profile=profile, achievement=first_win):
            unlocked_slugs.append(first_win.slug)

    streak_3 = by_slug.get("wins_streak_3")
    if (
        streak_3
        and game_type == GameType.TICTACTOE
        and _current_tictactoe_win_streak(db, user_id=user_id) >= 3
    ):
        if _unlock(db, user_id=user_id, profile=profile, achievement=streak_3):
            unlocked_slugs.append(streak_3.slug)

    xp_100 = by_slug.get("xp_100_reached")
    if xp_100 and profile.xp >= 100:
        if _unlock(db, user_id=user_id, profile=profile, achievement=xp_100):
            unlocked_slugs.append(xp_100.slug)

    finance_master = by_slug.get("first_finance_master")
    if finance_master and game_type == GameType.FINANCE_SIM and score >= 360:
        if _unlock(db, user_id=user_id, profile=profile, achievement=finance_master):
            unlocked_slugs.append(finance_master.slug)

    db.flush()
    return unlocked_slugs


def unlock_achievement_by_slug(
    db: Session,
    *,
    user_id: int,
    profile: UserGameProfile,
    slug: str,
) -> bool:
    ensure_default_achievements(db)
    achievement = db.scalar(select(Achievement).where(Achievement.slug == slug))
    if achievement is None:
        return False
    unlocked = _unlock(db, user_id=user_id, profile=profile, achievement=achievement)
    db.flush()
    return unlocked


def evaluate_achievements_after_learning(
    db: Session,
    *,
    user_id: int,
    profile: UserGameProfile,
    stars: int,
) -> list[str]:
    ensure_default_achievements(db)
    unlocked_slugs: list[str] = []

    achievements = db.scalars(
        select(Achievement).where(
            Achievement.slug.in_(
                [
                    "learning_first_lesson_completed",
                    "learning_streak_7_days",
                    "learning_math_100_xp",
                    "learning_perfect_score_3_stars",
                ],
            ),
        ),
    ).all()
    by_slug = {item.slug: item for item in achievements}

    first_lesson = by_slug.get("learning_first_lesson_completed")
    if first_lesson and _completed_lessons_count(db, user_id=user_id) >= 1:
        if _unlock(db, user_id=user_id, profile=profile, achievement=first_lesson):
            unlocked_slugs.append(first_lesson.slug)

    learning_streak = by_slug.get("learning_streak_7_days")
    if learning_streak and _learning_streak_days(db, user_id=user_id) >= 7:
        if _unlock(db, user_id=user_id, profile=profile, achievement=learning_streak):
            unlocked_slugs.append(learning_streak.slug)

    math_100 = by_slug.get("learning_math_100_xp")
    if math_100:
        accepted_math = {"matematica", "mathematics"}
        if _subject_xp_total(db, user_id=user_id, accepted_subject_names=accepted_math) >= 100:
            if _unlock(db, user_id=user_id, profile=profile, achievement=math_100):
                unlocked_slugs.append(math_100.slug)

    perfect = by_slug.get("learning_perfect_score_3_stars")
    if perfect and stars >= 3:
        if _unlock(db, user_id=user_id, profile=profile, achievement=perfect):
            unlocked_slugs.append(perfect.slug)

    db.flush()
    return unlocked_slugs
