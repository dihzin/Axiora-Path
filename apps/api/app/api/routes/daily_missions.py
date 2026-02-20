from __future__ import annotations

import logging
import math
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import (
    ChildProfile,
    DailyMission,
    DailyMissionStatus,
    Membership,
    Tenant,
    User,
)
from app.schemas.daily_missions import DailyMissionCompleteResponse, DailyMissionHistoryItem, DailyMissionResponse
from app.services.daily_mission_service import DailyMissionCompletionError, complete_daily_mission_by_id, generate_daily_mission
from app.services.features import is_feature_enabled

router = APIRouter(tags=["daily-missions"])
logger = logging.getLogger("axiora.api.daily_mission")


def _ensure_daily_missions_enabled(db: DBSession, tenant_id: int) -> None:
    if not is_feature_enabled("feature_daily_missions", db, tenant_id=tenant_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Feature is disabled for this tenant")


@router.get("/children/{child_id}/daily-mission", response_model=DailyMissionResponse)
def get_or_generate_daily_mission(
    child_id: int,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> DailyMissionResponse:
    _ensure_daily_missions_enabled(db, tenant.id)

    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    try:
        mission = generate_daily_mission(db, child, current_tenant_id=tenant.id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Daily mission service unavailable. Try again in a moment.",
        ) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("daily_mission_generation_failed", extra={"tenant_id": tenant.id, "child_id": child_id})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Daily mission service unavailable. Try again in a moment.",
        ) from exc
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
    _ensure_daily_missions_enabled(db, tenant.id)

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
    completed_count = sum(1 for mission in missions if mission.status == DailyMissionStatus.COMPLETED)
    completion_rate = (completed_count / len(missions) * 100.0) if missions else 0.0
    logger.info(
        "daily_mission_completion_rate",
        extra={
            "tenant_id": tenant.id,
            "child_id": child_id,
            "completion_rate": round(completion_rate, 2),
            "total_missions": len(missions),
            "completed_missions": completed_count,
        },
    )

    return [
        DailyMissionHistoryItem(
            date=mission.date,
            rarity=mission.rarity,
            status=mission.status,
            xp_reward=mission.xp_reward,
        )
        for mission in missions
    ]


@router.post("/daily-mission/{mission_id}/complete", response_model=DailyMissionCompleteResponse)
def complete_daily_mission(
    mission_id: str,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> DailyMissionCompleteResponse:
    _ensure_daily_missions_enabled(db, tenant.id)

    try:
        with db.begin():
            mission, xp_gained, coins_gained, streak_current = complete_daily_mission_by_id(
                db=db,
                events=events,
                tenant=tenant,
                user=user,
                mission_id=mission_id,
            )
    except DailyMissionCompletionError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == mission.child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
    new_level = math.floor(math.sqrt(child.xp_total / 100)) + 1
    return DailyMissionCompleteResponse(
        success=True,
        xp_gained=xp_gained,
        coins_gained=coins_gained,
        new_level=new_level,
        streak=streak_current,
    )
