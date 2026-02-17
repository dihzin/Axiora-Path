from __future__ import annotations

import random
from datetime import date

from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    ChildProfile,
    DailyMission,
    DailyMissionRarity,
    DailyMissionStatus,
    SavingGoal,
    Streak,
    TaskLog,
    TaskLogStatus,
)


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


def generate_daily_mission(db: Session, child: ChildProfile) -> DailyMission:
    today = date.today()
    existing = db.scalar(
        select(DailyMission).where(
            DailyMission.child_id == child.id,
            DailyMission.date == today,
        ),
    )
    if existing is not None:
        return existing

    streak = db.get(Streak, child.id)
    streak_current = streak.current if streak is not None else 0

    title, description = _build_mission_content(db, child)
    rarity = _resolve_rarity(streak_current)
    xp_reward, coin_reward = _resolve_rewards(rarity)

    mission = DailyMission(
        child_id=child.id,
        date=today,
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
                DailyMission.child_id == child.id,
                DailyMission.date == today,
            ),
        )
        if existing_after_conflict is not None:
            return existing_after_conflict
        raise
    db.refresh(mission)
    return mission
