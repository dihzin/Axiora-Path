from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, require_role
from app.models import ChildProfile, GameSettings, Membership, Tenant
from app.schemas.game_settings import GameSettingsOut, GameSettingsUpsertRequest

router = APIRouter(prefix="/api/parent", tags=["game-settings"])

DEFAULT_ENABLED_GAMES: dict[str, bool] = {
    "TICTACTOE": True,
    "WORDSEARCH": True,
    "CROSSWORD": True,
    "HANGMAN": True,
    "FINANCE_SIM": True,
}


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


def _get_or_create_settings(db: DBSession, *, tenant_id: int, child_id: int) -> GameSettings:
    settings = db.scalar(
        select(GameSettings).where(
            GameSettings.tenant_id == tenant_id,
            GameSettings.child_id == child_id,
        ),
    )
    if settings is not None:
        return settings

    settings = GameSettings(
        tenant_id=tenant_id,
        child_id=child_id,
        max_daily_xp=200,
        max_weekly_coin_conversion=500,
        enabled_games=DEFAULT_ENABLED_GAMES.copy(),
        require_approval_after_minutes=30,
    )
    db.add(settings)
    db.flush()
    return settings


def _to_response(settings: GameSettings) -> GameSettingsOut:
    return GameSettingsOut(
        id=settings.id,
        childId=settings.child_id,
        maxDailyXp=settings.max_daily_xp,
        maxWeeklyCoinConversion=settings.max_weekly_coin_conversion,
        enabledGames=settings.enabled_games,
        requireApprovalAfterMinutes=settings.require_approval_after_minutes,
        createdAt=settings.created_at,
        updatedAt=settings.updated_at,
    )


@router.get("/game-settings", response_model=GameSettingsOut)
def get_game_settings(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT"]))],
    child_id: Annotated[int | None, Query(alias="childId")] = None,
) -> GameSettingsOut:
    resolved_child_id = _resolve_child_id(db, tenant_id=tenant.id, requested_child_id=child_id)
    settings = _get_or_create_settings(db, tenant_id=tenant.id, child_id=resolved_child_id)
    db.commit()
    return _to_response(settings)


@router.post("/game-settings", response_model=GameSettingsOut)
def upsert_game_settings(
    payload: GameSettingsUpsertRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT"]))],
) -> GameSettingsOut:
    _get_child_or_404(db, tenant_id=tenant.id, child_id=payload.child_id)
    settings = _get_or_create_settings(db, tenant_id=tenant.id, child_id=payload.child_id)

    settings.max_daily_xp = payload.max_daily_xp
    settings.max_weekly_coin_conversion = payload.max_weekly_coin_conversion
    settings.enabled_games = payload.enabled_games
    settings.require_approval_after_minutes = payload.require_approval_after_minutes

    db.commit()
    return _to_response(settings)
