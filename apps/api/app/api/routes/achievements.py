from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, require_role
from app.models import Achievement, ChildAchievement, ChildProfile, Membership, Tenant
from app.schemas.achievements import AchievementItemOut, AchievementListResponse

router = APIRouter(tags=["achievements"])


@router.get("/achievements", response_model=AchievementListResponse)
def list_achievements(
    child_id: Annotated[int, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> AchievementListResponse:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    achievements = db.scalars(select(Achievement).order_by(Achievement.id.asc())).all()
    unlocked = db.scalars(
        select(ChildAchievement).where(ChildAchievement.child_id == child_id),
    ).all()
    unlocked_map = {item.achievement_id: item.unlocked_at for item in unlocked}

    return AchievementListResponse(
        child_id=child_id,
        achievements=[
            AchievementItemOut(
                id=item.id,
                slug=item.slug,
                title=item.title,
                description=item.description,
                icon_key=item.icon_key,
                xp_reward=item.xp_reward,
                coin_reward=item.coin_reward,
                badge_key=item.badge_key,
                unlocked=item.id in unlocked_map,
                unlocked_at=unlocked_map.get(item.id),
            )
            for item in achievements
        ],
    )
