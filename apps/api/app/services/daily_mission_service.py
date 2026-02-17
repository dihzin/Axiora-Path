from __future__ import annotations

import logging
import random
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    ChildProfile,
    DailyMission,
    DailyMissionRarity,
    DailyMissionStatus,
    EventLog,
    LedgerTransaction,
    LedgerTransactionType,
    PotAllocation,
    SavingGoal,
    Streak,
    Tenant,
    TaskLog,
    TaskLogStatus,
    User,
    Wallet,
)
from app.services.avatar import compute_avatar_stage
from app.services.events import EventService
from app.services.goals import sync_locked_goals_for_child
from app.services.wallet import split_amount_by_pots

logger = logging.getLogger("axiora.api.daily_mission")


class DailyMissionCompletionError(Exception):
    pass


def _resolve_rarity(streak_current: int) -> DailyMissionRarity:
    roll = random.random()
    if streak_current >= 21:
        if roll < 0.20:
            return DailyMissionRarity.EPIC
        if roll < 0.60:
            return DailyMissionRarity.SPECIAL
        return DailyMissionRarity.NORMAL
    if streak_current >= 7:
        if roll < 0.40:
            return DailyMissionRarity.SPECIAL
    return DailyMissionRarity.NORMAL


def _resolve_rewards(rarity: DailyMissionRarity) -> tuple[int, int]:
    base_xp = random.randint(10, 20)
    base_coins = random.randint(3, 10)
    multiplier = 1
    if rarity == DailyMissionRarity.SPECIAL:
        multiplier = 2
    elif rarity == DailyMissionRarity.EPIC:
        multiplier = 3
    return base_xp * multiplier, base_coins * multiplier


def _build_mission_content(db: Session, child: ChildProfile) -> tuple[str, str]:
    pending_log = db.scalar(
        select(TaskLog)
        .where(
            TaskLog.child_id == child.id,
            TaskLog.tenant_id == child.tenant_id,
            TaskLog.status == TaskLogStatus.PENDING,
        )
        .order_by(desc(TaskLog.date), desc(TaskLog.id))
        .limit(1),
    )
    if pending_log is not None:
        return (
            "Completar tarefa pendente",
            "Finalize uma tarefa que ja esta pendente para manter a rotina em dia.",
        )

    active_goal = db.scalar(
        select(SavingGoal)
        .where(
            SavingGoal.child_id == child.id,
            SavingGoal.tenant_id == child.tenant_id,
            SavingGoal.is_locked.is_(True),
        )
        .order_by(desc(SavingGoal.created_at), desc(SavingGoal.id))
        .limit(1),
    )
    if active_goal is not None:
        return (
            "Contribuir para meta",
            "Conclua uma acao que gere recompensa para aproximar sua meta de economia.",
        )

    return (
        "Registrar humor do dia",
        "Conte como esta se sentindo hoje para ajudar Axion a ajustar seu plano.",
    )


def generate_daily_mission(db: Session, child: ChildProfile, current_tenant_id: int) -> DailyMission:
    assert child.tenant_id == current_tenant_id

    existing = db.scalar(
        select(DailyMission).where(
            DailyMission.tenant_id == current_tenant_id,
            DailyMission.child_id == child.id,
            DailyMission.date == func.current_date(),
        ),
    )
    if existing is not None:
        return existing

    streak = db.get(Streak, child.id)
    streak_current = streak.current if streak is not None else 0

    title, description = _build_mission_content(db, child)
    rarity = _resolve_rarity(streak_current)
    xp_reward, coin_reward = _resolve_rewards(rarity)
    logger.info(
        "daily_mission_rarity",
        extra={
            "tenant_id": child.tenant_id,
            "child_id": child.id,
            "mission_rarity": rarity.value,
            "xp_reward": xp_reward,
            "coin_reward": coin_reward,
        },
    )

    mission = DailyMission(
        tenant_id=current_tenant_id,
        child_id=child.id,
        date=date.today(),
        title=title,
        description=description,
        rarity=rarity,
        xp_reward=xp_reward,
        coin_reward=coin_reward,
        status=DailyMissionStatus.PENDING,
    )
    db.add(mission)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing_after_conflict = db.scalar(
            select(DailyMission).where(
                DailyMission.tenant_id == current_tenant_id,
                DailyMission.child_id == child.id,
                DailyMission.date == func.current_date(),
            ),
        )
        if existing_after_conflict is not None:
            return existing_after_conflict
        raise
    db.refresh(mission)
    logger.info(
        "daily_mission_generated",
        extra={
            "tenant_id": child.tenant_id,
            "child_id": child.id,
            "mission_id": mission.id,
            "mission_rarity": mission.rarity.value,
            "xp_reward": mission.xp_reward,
            "coin_reward": mission.coin_reward,
        },
    )
    return mission


def _update_streak_for_completion(
    db: Session,
    *,
    tenant_id: int,
    actor_user_id: int,
    child_id: int,
    mission_date: date,
) -> int:
    streak = db.get(Streak, child_id)
    if streak is None:
        streak = Streak(
            child_id=child_id,
            current=1,
            last_date=mission_date,
            freeze_used_today=False,
            freeze_tokens=1,
        )
        db.add(streak)
        return 1

    if streak.last_date is None:
        streak.current = 1
        streak.last_date = mission_date
        streak.freeze_used_today = False
        return streak.current

    gap = (mission_date - streak.last_date).days
    if gap < 0 or gap == 0:
        return streak.current
    if gap == 1:
        streak.current += 1
        streak.freeze_used_today = False
        streak.last_date = mission_date
        return streak.current

    if streak.freeze_tokens > 0:
        streak.freeze_tokens -= 1
        streak.freeze_used_today = True
        streak.last_date = mission_date
        db.add(
            EventLog(
                tenant_id=tenant_id,
                actor_user_id=actor_user_id,
                child_id=child_id,
                type="streak.freeze.used",
                payload={"mark_date": str(mission_date), "remaining_freeze_tokens": streak.freeze_tokens},
            ),
        )
        return streak.current

    streak.current = 1
    streak.freeze_used_today = False
    streak.last_date = mission_date
    return streak.current


def complete_daily_mission_by_id(
    *,
    db: Session,
    events: EventService,
    tenant: Tenant,
    user: User,
    mission_id: str,
) -> tuple[DailyMission, int, int, int]:
    try:
        mission = db.scalar(select(DailyMission).where(DailyMission.id == mission_id))
        if mission is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily mission not found")

        child = db.scalar(
            select(ChildProfile).where(
                ChildProfile.id == mission.child_id,
                ChildProfile.tenant_id == tenant.id,
                ChildProfile.deleted_at.is_(None),
            ),
        )
        if child is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

        # Idempotency guard: never re-apply reward for already completed mission.
        if mission.status == DailyMissionStatus.COMPLETED:
            streak = db.get(Streak, child.id)
            streak_current = streak.current if streak is not None else 0
            return mission, 0, 0, streak_current

        wallet = db.scalar(
            select(Wallet).where(
                Wallet.tenant_id == tenant.id,
                Wallet.child_id == child.id,
            ),
        )
        if wallet is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")

        allocations = db.scalars(
            select(PotAllocation).where(
                PotAllocation.tenant_id == tenant.id,
                PotAllocation.wallet_id == wallet.id,
            ),
        ).all()
        allocation_map = {allocation.pot: allocation.percent for allocation in allocations}
        pot_split = split_amount_by_pots(mission.coin_reward, allocation_map)

        mission.status = DailyMissionStatus.COMPLETED
        mission.completed_at = datetime.now(UTC)

        child.xp_total += mission.xp_reward
        child.avatar_stage = compute_avatar_stage(child.xp_total)
        child.last_mission_completed_at = mission.completed_at

        tx = LedgerTransaction(
            tenant_id=tenant.id,
            wallet_id=wallet.id,
            type=LedgerTransactionType.EARN,
            amount_cents=mission.coin_reward,
            metadata_json={
                "source": "daily_mission.complete",
                "mission_id": mission.id,
                "child_id": child.id,
                "pot_split": pot_split,
            },
        )
        db.add(tx)
        db.flush()

        streak_current = _update_streak_for_completion(
            db,
            tenant_id=tenant.id,
            actor_user_id=user.id,
            child_id=child.id,
            mission_date=mission.date,
        )
        unlocked_goal_ids = sync_locked_goals_for_child(db, tenant_id=tenant.id, child_id=child.id)

        events.emit(
            type="daily_mission.completed",
            tenant_id=tenant.id,
            actor_user_id=user.id,
            child_id=child.id,
            payload={
                "mission_id": mission.id,
                "xp_gained": mission.xp_reward,
                "coins_gained": mission.coin_reward,
                "ledger_transaction_id": tx.id,
                "streak": streak_current,
                "unlocked_goal_ids": unlocked_goal_ids,
            },
        )
        events.emit(
            type="mission_completed",
            tenant_id=tenant.id,
            actor_user_id=user.id,
            child_id=child.id,
            payload={
                "mission_id": mission.id,
                "rarity": mission.rarity.value,
                "xp_gained": mission.xp_reward,
                "coins_gained": mission.coin_reward,
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise DailyMissionCompletionError("Failed to complete daily mission") from exc

    logger.info(
        "daily_mission_completed",
        extra={
            "tenant_id": tenant.id,
            "user_id": user.id,
            "child_id": mission.child_id,
            "mission_id": mission.id,
            "mission_rarity": mission.rarity.value,
            "xp_reward": mission.xp_reward,
            "coin_reward": mission.coin_reward,
        },
    )
    logger.info(
        "mission_completed",
        extra={
            "event_type": "mission_completed",
            "tenant_id": tenant.id,
            "child_id": mission.child_id,
            "school_id": mission.school_id,
            "mission_rarity": mission.rarity.value,
            "xp_reward": mission.xp_reward,
            "coin_reward": mission.coin_reward,
        },
    )

    return mission, mission.xp_reward, mission.coin_reward, streak_current
