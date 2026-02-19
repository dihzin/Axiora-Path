from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, require_role
from app.models import ChildProfile, LearningSettings, Membership, QuestionDifficulty, Tenant
from app.schemas.learning_settings import LearningSettingsOut, LearningSettingsUpsertRequest

router = APIRouter(prefix="/api/parent", tags=["learning-settings"])


def _get_child_or_404(db: DBSession, *, tenant_id: int, child_id: int) -> ChildProfile:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant_id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
    return child


def _resolve_child_id(db: DBSession, *, tenant_id: int, requested_child_id: int | None) -> int:
    if requested_child_id is not None:
        _get_child_or_404(db, tenant_id=tenant_id, child_id=requested_child_id)
        return requested_child_id

    children = db.scalars(
        select(ChildProfile).where(
            ChildProfile.tenant_id == tenant_id,
            ChildProfile.deleted_at.is_(None),
        ),
    ).all()
    if not children:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
    if len(children) > 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="childId is required for tenants with multiple children")
    return children[0].id


def _get_or_create_settings(db: DBSession, *, tenant_id: int, child_id: int) -> LearningSettings:
    settings = db.scalar(
        select(LearningSettings).where(
            LearningSettings.tenant_id == tenant_id,
            LearningSettings.child_id == child_id,
        ),
    )
    if settings is not None:
        return settings

    settings = LearningSettings(
        tenant_id=tenant_id,
        child_id=child_id,
        max_daily_learning_xp=200,
        max_lessons_per_day=5,
        difficulty_ceiling=QuestionDifficulty.HARD,
        enable_spaced_repetition=True,
        enable_coins_rewards=True,
        xp_multiplier=1.0,
        coins_enabled=True,
        enabled_subjects={},
    )
    db.add(settings)
    db.flush()
    return settings


def _to_response(settings: LearningSettings) -> LearningSettingsOut:
    return LearningSettingsOut(
        id=settings.id,
        childId=settings.child_id,
        maxDailyLearningXP=settings.max_daily_learning_xp,
        maxLessonsPerDay=settings.max_lessons_per_day,
        difficultyCeiling=settings.difficulty_ceiling,
        enableSpacedRepetition=settings.enable_spaced_repetition,
        enableCoinsRewards=settings.enable_coins_rewards,
        xpMultiplier=float(settings.xp_multiplier),
        coinsEnabled=settings.enable_coins_rewards,
        enabledSubjects=settings.enabled_subjects,
        createdAt=settings.created_at,
        updatedAt=settings.updated_at,
    )


@router.get("/learning-settings", response_model=LearningSettingsOut)
def get_learning_settings(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT"]))],
    child_id: Annotated[int | None, Query(alias="childId")] = None,
) -> LearningSettingsOut:
    resolved_child_id = _resolve_child_id(db, tenant_id=tenant.id, requested_child_id=child_id)
    settings = _get_or_create_settings(db, tenant_id=tenant.id, child_id=resolved_child_id)
    db.commit()
    return _to_response(settings)


@router.post("/learning-settings", response_model=LearningSettingsOut)
def upsert_learning_settings(
    payload: LearningSettingsUpsertRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT"]))],
) -> LearningSettingsOut:
    _get_child_or_404(db, tenant_id=tenant.id, child_id=payload.child_id)
    settings = _get_or_create_settings(db, tenant_id=tenant.id, child_id=payload.child_id)

    settings.max_daily_learning_xp = payload.max_daily_learning_xp
    settings.max_lessons_per_day = payload.max_lessons_per_day
    settings.difficulty_ceiling = payload.difficulty_ceiling
    settings.enable_spaced_repetition = payload.enable_spaced_repetition
    settings.enable_coins_rewards = payload.enable_coins_rewards
    settings.xp_multiplier = payload.xp_multiplier
    settings.coins_enabled = payload.enable_coins_rewards
    settings.enabled_subjects = payload.enabled_subjects

    db.commit()
    return _to_response(settings)
