from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.models import Membership, Tenant, User, UserUXSettings
from app.schemas.user_ux_settings import UserUXSettingsOut, UserUXSettingsUpsertRequest

router = APIRouter(prefix="/api/user", tags=["user-ux-settings"])


def _get_or_create(db: DBSession, *, user_id: int) -> UserUXSettings:
    row = db.scalar(select(UserUXSettings).where(UserUXSettings.user_id == user_id))
    if row is not None:
        return row
    row = UserUXSettings(
        user_id=user_id,
        sound_enabled=True,
        haptics_enabled=True,
        reduced_motion=False,
    )
    db.add(row)
    db.flush()
    return row


def _to_out(row: UserUXSettings) -> UserUXSettingsOut:
    return UserUXSettingsOut(
        id=row.id,
        userId=row.user_id,
        soundEnabled=row.sound_enabled,
        hapticsEnabled=row.haptics_enabled,
        reducedMotion=row.reduced_motion,
        createdAt=row.created_at,
        updatedAt=row.updated_at,
    )


@router.get("/ux-settings", response_model=UserUXSettingsOut)
def get_ux_settings(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> UserUXSettingsOut:
    row = _get_or_create(db, user_id=user.id)
    db.commit()
    return _to_out(row)


@router.post("/ux-settings", response_model=UserUXSettingsOut)
def upsert_ux_settings(
    payload: UserUXSettingsUpsertRequest,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> UserUXSettingsOut:
    row = _get_or_create(db, user_id=user.id)
    row.sound_enabled = payload.sound_enabled
    row.haptics_enabled = payload.haptics_enabled
    row.reduced_motion = payload.reduced_motion
    db.commit()
    return _to_out(row)
