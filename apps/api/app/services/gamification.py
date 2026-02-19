from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import GameSession, GameType, UserGameProfile
from app.services.achievement_engine import evaluate_achievements_after_game

XP_PER_LEVEL = 100
MAX_XP_PER_DAY = 200


def calculate_level(xp: int) -> int:
    safe_xp = max(0, xp)
    return (safe_xp // XP_PER_LEVEL) + 1


def calculate_xp_from_score(score: int) -> int:
    safe_score = max(0, score)
    return safe_score // 10


def calculate_coins_from_score(score: int) -> int:
    safe_score = max(0, score)
    return safe_score // 20


def _get_or_create_profile(db: Session, *, user_id: int) -> UserGameProfile:
    profile = db.scalar(select(UserGameProfile).where(UserGameProfile.user_id == user_id))
    if profile is not None:
        return profile

    profile = UserGameProfile(user_id=user_id, xp=0, level=1, axion_coins=0, daily_xp=0, last_xp_reset=date.today())
    db.add(profile)
    db.flush()
    return profile


def get_or_create_game_profile(db: Session, *, user_id: int) -> UserGameProfile:
    return _get_or_create_profile(db, user_id=user_id)


def _reset_daily_xp_if_needed(profile: UserGameProfile, *, target_date: date) -> None:
    if profile.last_xp_reset != target_date:
        profile.daily_xp = 0
        profile.last_xp_reset = target_date


def _apply_xp(
    profile: UserGameProfile,
    *,
    amount: int,
    target_date: date,
    max_xp_per_day: int,
) -> int:
    _reset_daily_xp_if_needed(profile, target_date=target_date)
    requested = max(0, amount)
    effective_max_xp_per_day = max(0, max_xp_per_day)
    remaining_today = max(0, effective_max_xp_per_day - profile.daily_xp)
    granted = min(requested, remaining_today)
    if granted <= 0:
        return 0

    profile.daily_xp += granted
    profile.xp += granted
    profile.level = calculate_level(profile.xp)
    return granted


def addXP(
    db: Session,
    *,
    user_id: int,
    xp_amount: int,
    target_date: date | None = None,
    max_xp_per_day: int = MAX_XP_PER_DAY,
) -> UserGameProfile:
    profile = _get_or_create_profile(db, user_id=user_id)
    _apply_xp(
        profile,
        amount=xp_amount,
        target_date=target_date or date.today(),
        max_xp_per_day=max_xp_per_day,
    )
    db.flush()
    return profile


def addCoins(db: Session, *, user_id: int, coin_amount: int) -> UserGameProfile:
    profile = _get_or_create_profile(db, user_id=user_id)
    granted_coins = max(0, coin_amount)
    profile.axion_coins += granted_coins
    db.flush()
    return profile


@dataclass(slots=True)
class RegisterGameSessionResult:
    profile: UserGameProfile
    session: GameSession
    requested_xp: int
    granted_xp: int
    remaining_xp_today: int
    max_xp_per_day: int
    unlocked_achievements: list[str]


def registerGameSession(
    db: Session,
    *,
    user_id: int,
    game_type: GameType,
    score: int,
    xp: int | None = None,
    coins: int | None = None,
    target_date: date | None = None,
    max_xp_per_day: int = MAX_XP_PER_DAY,
) -> RegisterGameSessionResult:
    session_date = target_date or date.today()
    safe_score = max(0, score)
    requested_xp = max(0, xp if xp is not None else calculate_xp_from_score(safe_score))
    requested_coins = max(0, coins if coins is not None else calculate_coins_from_score(safe_score))

    profile = _get_or_create_profile(db, user_id=user_id)
    _reset_daily_xp_if_needed(profile, target_date=session_date)
    effective_max_xp_per_day = max(0, max_xp_per_day)
    remaining_before = max(0, effective_max_xp_per_day - profile.daily_xp)
    granted_xp = min(requested_xp, remaining_before)
    if granted_xp > 0:
        profile.daily_xp += granted_xp
        profile.xp += granted_xp
        profile.level = calculate_level(profile.xp)

    granted_coins = 0
    if requested_xp > 0 and granted_xp > 0 and requested_coins > 0:
        granted_coins = max(1, (requested_coins * granted_xp) // requested_xp)

    if granted_coins > 0:
        profile.axion_coins += granted_coins

    game_session = GameSession(
        user_id=user_id,
        game_type=game_type,
        score=safe_score,
        xp_earned=granted_xp,
        coins_earned=granted_coins,
    )
    db.add(game_session)
    db.flush()

    unlocked_achievements = evaluate_achievements_after_game(
        db,
        user_id=user_id,
        profile=profile,
        game_type=game_type,
        score=safe_score,
    )

    remaining_after = max(0, effective_max_xp_per_day - profile.daily_xp)
    return RegisterGameSessionResult(
        profile=profile,
        session=game_session,
        requested_xp=requested_xp,
        granted_xp=granted_xp,
        remaining_xp_today=remaining_after,
        max_xp_per_day=effective_max_xp_per_day,
        unlocked_achievements=unlocked_achievements,
    )
