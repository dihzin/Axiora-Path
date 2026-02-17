from __future__ import annotations

import math
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import (
    ChildProfile,
    DailyMission,
    DailyMissionStatus,
    EventLog,
    LedgerTransaction,
    LedgerTransactionType,
    Membership,
    PotAllocation,
    Streak,
    Tenant,
    User,
    Wallet,
)
from app.schemas.daily_missions import DailyMissionCompleteResponse, DailyMissionHistoryItem, DailyMissionResponse
from app.services.avatar import compute_avatar_stage
from app.services.daily_mission_service import generate_daily_mission
from app.services.goals import sync_locked_goals_for_child
from app.services.wallet import split_amount_by_pots

router = APIRouter(tags=["daily-missions"])


@router.get("/children/{child_id}/daily-mission", response_model=DailyMissionResponse)
def get_or_generate_daily_mission(
    child_id: int,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> DailyMissionResponse:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    mission = generate_daily_mission(db, child)
    return DailyMissionResponse(
        id=str(mission.id),
        date=mission.date,
        title=mission.title,
        description=mission.description,
        rarity=mission.rarity,
        xp_reward=mission.xp_reward,
        coin_reward=mission.coin_reward,
        status=mission.status,
    )


@router.get("/children/{child_id}/daily-mission/history", response_model=list[DailyMissionHistoryItem])
def get_daily_mission_history(
    child_id: int,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> list[DailyMissionHistoryItem]:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    missions = db.scalars(
        select(DailyMission)
        .where(DailyMission.child_id == child_id)
        .order_by(DailyMission.date.desc())
        .limit(30),
    ).all()

    return [
        DailyMissionHistoryItem(
            date=mission.date,
            rarity=mission.rarity,
            status=mission.status,
            xp_reward=mission.xp_reward,
        )
        for mission in missions
    ]


def _update_streak_for_completion(
    db: DBSession,
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
    if gap < 0:
        return streak.current
    if gap == 0:
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


@router.post("/daily-mission/{mission_id}/complete", response_model=DailyMissionCompleteResponse)
def complete_daily_mission(
    mission_id: str,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> DailyMissionCompleteResponse:
    with db.begin():
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

        if mission.status != DailyMissionStatus.PENDING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Daily mission already completed")

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

    new_level = math.floor(math.sqrt(child.xp_total / 100)) + 1
    return DailyMissionCompleteResponse(
        success=True,
        xp_gained=mission.xp_reward,
        coins_gained=mission.coin_reward,
        new_level=new_level,
        streak=streak_current,
    )
