from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EventLog, UserGameProfile

EconomyEventType = Literal[
    "GAME_PLAYED",
    "GAME_WON",
    "GAME_PERFECT",
    "PERSONAL_BEST",
    "DAILY_MISSION_COMPLETED",
    "WEEKLY_MISSION_COMPLETED",
    "LEAGUE_PROMOTION",
    "LEAGUE_CYCLE_REWARD",
    "SEASON_TIER_REWARD",
    "STREAK_MILESTONE",
]


class GameEconomyError(ValueError):
    """Domain error for invalid economy operations."""


@dataclass(slots=True)
class EconomyReward:
    xp: int
    coins: int
    season_xp: int = 0


@dataclass(slots=True)
class EconomyAwardResult:
    event_type: EconomyEventType
    requested: EconomyReward
    granted: EconomyReward


REWARD_TABLE_V1: dict[EconomyEventType, EconomyReward] = {
    "GAME_PLAYED": EconomyReward(xp=10, coins=2, season_xp=10),
    "GAME_WON": EconomyReward(xp=20, coins=4, season_xp=20),
    "GAME_PERFECT": EconomyReward(xp=15, coins=3, season_xp=10),
    "PERSONAL_BEST": EconomyReward(xp=25, coins=5, season_xp=15),
    "DAILY_MISSION_COMPLETED": EconomyReward(xp=40, coins=10, season_xp=40),
    "WEEKLY_MISSION_COMPLETED": EconomyReward(xp=120, coins=30, season_xp=80),
    "LEAGUE_PROMOTION": EconomyReward(xp=80, coins=25, season_xp=120),
    "LEAGUE_CYCLE_REWARD": EconomyReward(xp=0, coins=40, season_xp=0),
    "SEASON_TIER_REWARD": EconomyReward(xp=0, coins=0, season_xp=0),
    "STREAK_MILESTONE": EconomyReward(xp=30, coins=8, season_xp=20),
}


def _calculate_level(xp: int) -> int:
    safe_xp = max(0, int(xp))
    return (safe_xp // 100) + 1


def get_economy_reward(event_type: EconomyEventType) -> EconomyReward:
    reward = REWARD_TABLE_V1.get(event_type)
    if reward is None:
        raise GameEconomyError(f"Unsupported economy event_type: {event_type}")
    return EconomyReward(
        xp=max(0, int(reward.xp)),
        coins=max(0, int(reward.coins)),
        season_xp=max(0, int(reward.season_xp)),
    )


def _get_or_create_profile(db: Session, *, beneficiary_user_id: int) -> UserGameProfile:
    profile = db.scalar(select(UserGameProfile).where(UserGameProfile.user_id == beneficiary_user_id))
    if profile is not None:
        return profile
    profile = UserGameProfile(
        user_id=beneficiary_user_id,
        xp=0,
        level=1,
        axion_coins=0,
        daily_xp=0,
        last_xp_reset=date.today(),
    )
    db.add(profile)
    db.flush()
    return profile


def _apply_season_xp_event(
    db: Session,
    *,
    tenant_id: int | None,
    beneficiary_user_id: int,
    child_id: int,
    season_xp: int,
    event_type: EconomyEventType,
    metadata: dict[str, object],
) -> int:
    granted = max(0, int(season_xp))
    if granted <= 0 or tenant_id is None:
        return 0
    db.add(
        EventLog(
            tenant_id=tenant_id,
            actor_user_id=beneficiary_user_id,
            child_id=child_id,
            type="games.season_xp.awarded",
            payload={
                "eventType": event_type,
                "seasonXp": granted,
                **metadata,
            },
        )
    )
    db.flush()
    return granted


def award_economy_event(
    db: Session,
    *,
    child_id: int,
    beneficiary_user_id: int,
    event_type: EconomyEventType,
    tenant_id: int | None = None,
    metadata: dict[str, object] | None = None,
    xp_multiplier: float = 1.0,
    coins_multiplier: float = 1.0,
    season_xp_multiplier: float = 1.0,
    reward_override: EconomyReward | None = None,
    track_daily_xp: bool = False,
) -> EconomyAwardResult:
    if child_id <= 0:
        raise GameEconomyError("child_id must be a positive integer")
    if beneficiary_user_id <= 0:
        raise GameEconomyError("beneficiary_user_id must be a positive integer")

    base = reward_override if reward_override is not None else get_economy_reward(event_type)
    requested = EconomyReward(
        xp=max(0, int(round(base.xp * max(0.0, xp_multiplier)))),
        coins=max(0, int(round(base.coins * max(0.0, coins_multiplier)))),
        season_xp=max(0, int(round(base.season_xp * max(0.0, season_xp_multiplier)))),
    )

    profile = _get_or_create_profile(db, beneficiary_user_id=beneficiary_user_id)
    if requested.xp > 0:
        profile.xp += requested.xp
        profile.level = _calculate_level(profile.xp)
        if track_daily_xp:
            profile.daily_xp += requested.xp
    if requested.coins > 0:
        profile.axion_coins += requested.coins

    granted_season_xp = _apply_season_xp_event(
        db,
        tenant_id=tenant_id,
        beneficiary_user_id=beneficiary_user_id,
        child_id=child_id,
        season_xp=requested.season_xp,
        event_type=event_type,
        metadata=metadata or {},
    )
    db.flush()
    return EconomyAwardResult(
        event_type=event_type,
        requested=requested,
        granted=EconomyReward(
            xp=requested.xp,
            coins=requested.coins,
            season_xp=granted_season_xp,
        ),
    )
