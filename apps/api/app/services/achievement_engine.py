from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Achievement, GameSession, GameType, UserAchievement, UserGameProfile


def _calculate_level(xp: int) -> int:
    safe_xp = max(0, xp)
    return (safe_xp // 100) + 1


DEFAULT_ACHIEVEMENTS: list[dict[str, str | int]] = [
    {
        "slug": "first_win",
        "name": "First Win",
        "description": "Conquiste sua primeira vitória no Jogo da Velha.",
        "icon": "trophy",
        "xp_reward": 20,
        "condition_type": "first_win_tictactoe",
        "condition_value": 1,
    },
    {
        "slug": "wins_streak_3",
        "name": "3 Wins Streak",
        "description": "Ganhe 3 partidas seguidas no Jogo da Velha.",
        "icon": "flame",
        "xp_reward": 30,
        "condition_type": "tictactoe_win_streak",
        "condition_value": 3,
    },
    {
        "slug": "xp_100_reached",
        "name": "100 XP reached",
        "description": "Alcance 100 XP totais.",
        "icon": "sparkles",
        "xp_reward": 25,
        "condition_type": "xp_reached",
        "condition_value": 100,
    },
    {
        "slug": "first_finance_master",
        "name": "First Finance Master rating",
        "description": "Alcance rating Financial Master no Mesada Inteligente.",
        "icon": "piggy-bank",
        "xp_reward": 35,
        "condition_type": "finance_master_rating",
        "condition_value": 1,
    },
]


def ensure_default_achievements(db: Session) -> None:
    for item in DEFAULT_ACHIEVEMENTS:
        existing = db.scalar(select(Achievement).where(Achievement.slug == str(item["slug"])))
        if existing is not None:
            continue
        achievement = Achievement(
            slug=str(item["slug"]),
            title=str(item["name"]),
            name=str(item["name"]),
            description=str(item["description"]),
            icon=str(item["icon"]),
            icon_key=str(item["icon"]),
            xp_reward=int(item["xp_reward"]),
            condition_type=str(item["condition_type"]),
            condition_value=int(item["condition_value"]),
        )
        db.add(achievement)
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
        # tictactoe score convention: WIN >= 500, DRAW = 200, LOSS = 50.
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
    bonus = max(0, achievement.xp_reward)
    if bonus > 0:
        profile.xp += bonus
        profile.level = _calculate_level(profile.xp)
    return True


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
    if streak_3 and game_type == GameType.TICTACTOE and _current_tictactoe_win_streak(db, user_id=user_id) >= 3:
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
