from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import UserLearningStatus
from app.services.gamification import get_or_create_game_profile

MAX_ENERGY = 5
REGEN_INTERVAL_MINUTES = 10
ZERO_ENERGY_WAIT_MINUTES = 30
REFILL_COST_COINS = 25


class EnergyWaitRequiredError(ValueError):
    pass


class InsufficientCoinsError(ValueError):
    pass


@dataclass(slots=True)
class EnergySnapshot:
    energy: int
    max_energy: int
    can_play: bool
    seconds_until_playable: int
    seconds_until_next_energy: int
    refill_coin_cost: int
    axion_coins: int


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _get_or_create_status(db: Session, *, user_id: int) -> UserLearningStatus:
    status = db.scalar(select(UserLearningStatus).where(UserLearningStatus.user_id == user_id))
    if status is not None:
        return status
    status = UserLearningStatus(
        user_id=user_id,
        energy=MAX_ENERGY,
        last_energy_update=_now_utc(),
    )
    db.add(status)
    db.flush()
    return status


def _seconds_until_playable(status: UserLearningStatus, *, now: datetime) -> int:
    if status.energy > 0:
        return 0
    elapsed = (now - status.last_energy_update).total_seconds()
    wait_seconds = ZERO_ENERGY_WAIT_MINUTES * 60
    return max(0, int(wait_seconds - elapsed))


def _seconds_until_next_energy(status: UserLearningStatus, *, now: datetime) -> int:
    if status.energy <= 0 or status.energy >= MAX_ENERGY:
        return 0
    elapsed = (now - status.last_energy_update).total_seconds()
    interval = REGEN_INTERVAL_MINUTES * 60
    remainder = int(elapsed) % interval
    if remainder == 0:
        return interval
    return interval - remainder


def _apply_regen(status: UserLearningStatus, *, now: datetime) -> None:
    if status.energy <= 0:
        if _seconds_until_playable(status, now=now) == 0:
            status.energy = MAX_ENERGY
            status.last_energy_update = now
        return

    if status.energy >= MAX_ENERGY:
        status.last_energy_update = now
        return

    elapsed_seconds = int((now - status.last_energy_update).total_seconds())
    interval_seconds = REGEN_INTERVAL_MINUTES * 60
    if elapsed_seconds < interval_seconds:
        return

    recovered = elapsed_seconds // interval_seconds
    status.energy = min(MAX_ENERGY, status.energy + recovered)
    status.last_energy_update = status.last_energy_update + timedelta(
        seconds=recovered * interval_seconds
    )
    if status.energy >= MAX_ENERGY:
        status.last_energy_update = now


def get_energy_snapshot(db: Session, *, user_id: int) -> EnergySnapshot:
    now = _now_utc()
    status = _get_or_create_status(db, user_id=user_id)
    _apply_regen(status, now=now)
    profile = get_or_create_game_profile(db, user_id=user_id)
    db.flush()
    return EnergySnapshot(
        energy=status.energy,
        max_energy=MAX_ENERGY,
        can_play=status.energy > 0,
        seconds_until_playable=_seconds_until_playable(status, now=now),
        seconds_until_next_energy=_seconds_until_next_energy(status, now=now),
        refill_coin_cost=REFILL_COST_COINS,
        axion_coins=profile.axion_coins,
    )


def consume_wrong_answer_energy(db: Session, *, user_id: int, cost: int = 1) -> EnergySnapshot:
    now = _now_utc()
    status = _get_or_create_status(db, user_id=user_id)
    _apply_regen(status, now=now)
    profile = get_or_create_game_profile(db, user_id=user_id)

    if status.energy <= 0:
        db.flush()
        return EnergySnapshot(
            energy=0,
            max_energy=MAX_ENERGY,
            can_play=False,
            seconds_until_playable=_seconds_until_playable(status, now=now),
            seconds_until_next_energy=0,
            refill_coin_cost=REFILL_COST_COINS,
            axion_coins=profile.axion_coins,
        )

    safe_cost = max(0, int(cost))
    if safe_cost > 0:
        status.energy = max(0, status.energy - safe_cost)
    status.last_energy_update = now
    db.flush()
    return EnergySnapshot(
        energy=status.energy,
        max_energy=MAX_ENERGY,
        can_play=status.energy > 0,
        seconds_until_playable=_seconds_until_playable(status, now=now),
        seconds_until_next_energy=_seconds_until_next_energy(status, now=now),
        refill_coin_cost=REFILL_COST_COINS,
        axion_coins=profile.axion_coins,
    )


def refill_energy_with_wait(db: Session, *, user_id: int) -> EnergySnapshot:
    now = _now_utc()
    status = _get_or_create_status(db, user_id=user_id)
    _apply_regen(status, now=now)
    profile = get_or_create_game_profile(db, user_id=user_id)

    remaining = _seconds_until_playable(status, now=now)
    if status.energy <= 0 and remaining > 0:
        raise EnergyWaitRequiredError("Wait time has not elapsed")

    status.energy = MAX_ENERGY
    status.last_energy_update = now
    db.flush()
    return EnergySnapshot(
        energy=status.energy,
        max_energy=MAX_ENERGY,
        can_play=True,
        seconds_until_playable=0,
        seconds_until_next_energy=0,
        refill_coin_cost=REFILL_COST_COINS,
        axion_coins=profile.axion_coins,
    )


def refill_energy_with_coins(db: Session, *, user_id: int) -> EnergySnapshot:
    now = _now_utc()
    status = _get_or_create_status(db, user_id=user_id)
    _apply_regen(status, now=now)
    profile = get_or_create_game_profile(db, user_id=user_id)

    if profile.axion_coins < REFILL_COST_COINS:
        raise InsufficientCoinsError("Not enough AxionCoins")

    profile.axion_coins -= REFILL_COST_COINS
    status.energy = MAX_ENERGY
    status.last_energy_update = now
    db.flush()
    return EnergySnapshot(
        energy=status.energy,
        max_energy=MAX_ENERGY,
        can_play=True,
        seconds_until_playable=0,
        seconds_until_next_energy=0,
        refill_coin_cost=REFILL_COST_COINS,
        axion_coins=profile.axion_coins,
    )
