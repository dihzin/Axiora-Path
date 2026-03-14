from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import GamePersonalBest, GameSession, GameType, UserGameProfile, UserLearningStatus
from app.schemas.games import GameResultPayload
from app.services.achievement_engine import evaluate_achievements_after_game
from app.services.axion_intelligence_v2 import apply_axion_decisions, compute_behavior_metrics

XP_PER_LEVEL = 100
MAX_XP_PER_DAY = 200

GAME_ID_TO_TYPE: dict[str, GameType] = {
    "tictactoe": GameType.TICTACTOE,
    "tic-tac-toe": GameType.TICTACTOE,
    "wordsearch": GameType.WORDSEARCH,
    "word-search": GameType.WORDSEARCH,
    "memory": GameType.MEMORY,
    "quiz": GameType.CROSSWORD,
    "finance-sim": GameType.FINANCE_SIM,
    "finance_sim": GameType.FINANCE_SIM,
    "tug-of-war": GameType.TUG_OF_WAR,
    "tug_of_war": GameType.TUG_OF_WAR,
}


def calculate_level(xp: int) -> int:
    safe_xp = max(0, xp)
    return (safe_xp // XP_PER_LEVEL) + 1


def calculate_xp_from_score(score: int) -> int:
    safe_score = max(0, score)
    return safe_score // 10


def calculate_coins_from_score(score: int) -> int:
    safe_score = max(0, score)
    return safe_score // 20


def resolve_game_type(game_id: str, fallback: GameType = GameType.CROSSWORD) -> GameType:
    normalized = game_id.strip().lower()
    return GAME_ID_TO_TYPE.get(normalized, fallback)


def resolve_game_type_strict(game_id: str) -> GameType | None:
    normalized = game_id.strip().lower()
    if not normalized:
        return None
    if normalized in GAME_ID_TO_TYPE:
        return GAME_ID_TO_TYPE[normalized]
    enum_key = normalized.upper()
    try:
        return GameType(enum_key)
    except ValueError:
        return None


def normalize_game_id(game_id: str, game_type: GameType) -> str:
    normalized = game_id.strip().lower()
    if normalized:
        return normalized
    return game_type.value.lower()


def _to_float_or_none(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


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


def _resolve_axion_xp_multiplier(db: Session, *, user_id: int) -> float:
    row = db.scalar(select(UserLearningStatus).where(UserLearningStatus.user_id == user_id))
    if row is None:
        return 1.0
    now = datetime.now(UTC)
    if row.event_boost_expires_at is None or row.event_boost_expires_at <= now:
        return 1.0
    return max(1.0, float(row.event_boost_multiplier))


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
    multiplier = _resolve_axion_xp_multiplier(db, user_id=user_id)
    effective_amount = max(0, int(round(xp_amount * multiplier)))
    profile = _get_or_create_profile(db, user_id=user_id)
    _apply_xp(
        profile,
        amount=effective_amount,
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


@dataclass(slots=True)
class CompleteGameSessionResult:
    register_result: RegisterGameSessionResult
    is_personal_best: bool
    personal_best_type: str | None
    personal_best: GamePersonalBest | None


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
    tenant_id: int | None = None,
    child_id: int | None = None,
    game_id: str | None = None,
    session_external_id: str | None = None,
    accuracy: float | None = None,
    correct_answers: int | None = None,
    wrong_answers: int | None = None,
    streak: int | None = None,
    max_streak: int | None = None,
    duration_seconds: int | None = None,
    level_reached: int | None = None,
    completed: bool = True,
    metadata: dict[str, Any] | None = None,
) -> RegisterGameSessionResult:
    session_date = target_date or date.today()
    profile = _get_or_create_profile(db, user_id=user_id)
    _reset_daily_xp_if_needed(profile, target_date=session_date)

    normalized_game_id = normalize_game_id(game_id or game_type.value.lower(), game_type)
    dedupe_session_id = (session_external_id or "").strip() or None
    if dedupe_session_id is not None:
        existing = db.scalar(
            select(GameSession).where(
                GameSession.user_id == user_id,
                GameSession.game_id == normalized_game_id,
                GameSession.session_external_id == dedupe_session_id,
            ),
        )
        if existing is not None:
            effective_max_xp_per_day = max(0, max_xp_per_day)
            remaining_after = max(0, effective_max_xp_per_day - profile.daily_xp)
            return RegisterGameSessionResult(
                profile=profile,
                session=existing,
                requested_xp=max(0, existing.xp_earned),
                granted_xp=max(0, existing.xp_earned),
                remaining_xp_today=remaining_after,
                max_xp_per_day=effective_max_xp_per_day,
                unlocked_achievements=[],
            )

    apply_axion_decisions(
        db,
        user_id=user_id,
        context="before_game",
        tenant_id=tenant_id,
    )
    safe_score = max(0, score)
    base_requested_xp = max(0, xp if xp is not None else calculate_xp_from_score(safe_score))
    xp_multiplier = _resolve_axion_xp_multiplier(db, user_id=user_id)
    requested_xp = max(0, int(round(base_requested_xp * xp_multiplier)))
    requested_coins = max(0, coins if coins is not None else calculate_coins_from_score(safe_score))

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
        tenant_id=tenant_id,
        child_id=child_id,
        user_id=user_id,
        game_type=game_type,
        game_id=normalized_game_id,
        session_external_id=dedupe_session_id,
        score=safe_score,
        accuracy=_to_float_or_none(accuracy),
        correct_answers=correct_answers,
        wrong_answers=wrong_answers,
        streak=streak,
        max_streak=max_streak,
        duration_seconds=duration_seconds,
        level_reached=level_reached,
        completed=completed,
        metadata_payload=metadata or {},
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
    compute_behavior_metrics(db, user_id=user_id)

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


def _update_personal_best(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    user_id: int,
    game_id: str,
    result: GameResultPayload,
) -> tuple[bool, str | None, GamePersonalBest]:
    best = db.scalar(
        select(GamePersonalBest).where(
            GamePersonalBest.child_id == child_id,
            GamePersonalBest.game_id == game_id,
        ),
    )
    if best is None:
        best = GamePersonalBest(
            tenant_id=tenant_id,
            child_id=child_id,
            user_id=user_id,
            game_id=game_id,
            best_score=result.score,
            best_streak=result.max_streak if result.max_streak is not None else result.streak,
            best_duration_seconds=result.duration_seconds,
            best_result_payload=result.model_dump(by_alias=True),
            last_surpassed_at=datetime.now(UTC),
        )
        db.add(best)
        db.flush()
        first_type = result.personal_best_type or "score"
        return True, first_type, best

    updated = False
    updated_type: str | None = None
    if result.score > (best.best_score or 0):
        best.best_score = result.score
        updated = True
        updated_type = "score"

    candidate_streak = result.max_streak if result.max_streak is not None else result.streak
    if candidate_streak is not None and candidate_streak > (best.best_streak or 0):
        best.best_streak = candidate_streak
        updated = True
        if updated_type is None:
            updated_type = "streak"

    if result.duration_seconds is not None:
        current_best_duration = best.best_duration_seconds
        if current_best_duration is None or result.duration_seconds < current_best_duration:
            best.best_duration_seconds = result.duration_seconds
            updated = True
            if updated_type is None:
                updated_type = "speed"

    if updated:
        best.last_surpassed_at = datetime.now(UTC)
        best.best_result_payload = result.model_dump(by_alias=True)
        db.flush()
    return updated, updated_type, best


def complete_game_session(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    child_id: int | None,
    result: GameResultPayload,
    resolved_game_type: GameType | None = None,
    max_xp_per_day: int = MAX_XP_PER_DAY,
) -> CompleteGameSessionResult:
    game_type = resolved_game_type or resolve_game_type_strict(result.game_id)
    if game_type is None:
        raise ValueError(f"Unsupported game_id: {result.game_id}")
    register_result = registerGameSession(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        user_id=user_id,
        game_type=game_type,
        game_id=result.game_id,
        session_external_id=result.session_id,
        score=result.score,
        xp=result.xp_delta,
        coins=result.coins_delta,
        max_xp_per_day=max_xp_per_day,
        accuracy=result.accuracy,
        correct_answers=result.correct_answers,
        wrong_answers=result.wrong_answers,
        streak=result.streak,
        max_streak=result.max_streak,
        duration_seconds=result.duration_seconds,
        level_reached=result.level_reached,
        completed=result.completed,
        metadata=result.metadata,
    )

    is_personal_best = False
    personal_best_type: str | None = None
    personal_best: GamePersonalBest | None = None
    if child_id is not None:
        is_personal_best, personal_best_type, personal_best = _update_personal_best(
            db,
            tenant_id=tenant_id,
            child_id=child_id,
            user_id=user_id,
            game_id=normalize_game_id(result.game_id, game_type),
            result=result,
        )

    return CompleteGameSessionResult(
        register_result=register_result,
        is_personal_best=is_personal_best,
        personal_best_type=personal_best_type,
        personal_best=personal_best,
    )


def get_personal_best(db: Session, *, child_id: int, game_id: str) -> GamePersonalBest | None:
    return db.scalar(
        select(GamePersonalBest).where(
            GamePersonalBest.child_id == child_id,
            GamePersonalBest.game_id == game_id.strip().lower(),
        ),
    )
