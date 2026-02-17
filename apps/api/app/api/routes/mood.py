from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import ChildProfile, DailyMood, Membership, MoodType, Tenant, User
from app.schemas.mood import MoodCreateRequest, MoodOut

router = APIRouter(tags=["mood"])


@router.post("/mood", response_model=MoodOut, status_code=status.HTTP_201_CREATED)
def upsert_mood(
    payload: MoodCreateRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> MoodOut:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == payload.child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    mood_date = payload.date or date.today()
    daily = db.scalar(
        select(DailyMood).where(
            DailyMood.child_id == payload.child_id,
            DailyMood.date == mood_date,
        ),
    )
    if daily is None:
        daily = DailyMood(child_id=payload.child_id, date=mood_date, mood=MoodType(payload.mood))
        db.add(daily)
    else:
        daily.mood = MoodType(payload.mood)

    events.emit(
        type="mood.logged",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=payload.child_id,
        payload={"date": str(mood_date), "mood": payload.mood},
    )
    db.commit()
    return MoodOut(child_id=daily.child_id, date=daily.date, mood=daily.mood.value)


@router.get("/mood", response_model=list[MoodOut])
def list_mood(
    child_id: Annotated[int, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> list[MoodOut]:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    rows = db.scalars(
        select(DailyMood)
        .where(DailyMood.child_id == child_id)
        .order_by(DailyMood.date.desc()),
    ).all()
    return [MoodOut(child_id=row.child_id, date=row.date, mood=row.mood.value) for row in rows]
