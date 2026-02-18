from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.models import ChildProfile, GameSettings, GameType, Membership, Tenant, User
from app.schemas.games import (
    DailyXpLimitOut,
    GameSessionCreateRequest,
    GameSessionOut,
    GameSessionRegisterResponse,
    UserGameProfileOut,
)
from app.services.gamification import MAX_XP_PER_DAY, registerGameSession

router = APIRouter(prefix="/api/games", tags=["games"])


@router.post(
    "/session",
    response_model=GameSessionRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_game_session(
    payload: GameSessionCreateRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> GameSessionRegisterResponse:
    children = db.scalars(
        select(ChildProfile).where(
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    ).all()
    settings: GameSettings | None = None
    max_xp_per_day = MAX_XP_PER_DAY
    if len(children) == 1:
        child_id = children[0].id
        settings = db.scalar(
            select(GameSettings).where(
                GameSettings.tenant_id == tenant.id,
                GameSettings.child_id == child_id,
            ),
        )
        if settings is not None:
            max_xp_per_day = settings.max_daily_xp

            game_enabled = settings.enabled_games.get(payload.game_type, True)
            if not game_enabled:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Game disabled by parental control")

    result = registerGameSession(
        db,
        user_id=user.id,
        game_type=GameType(payload.game_type),
        score=payload.score,
        max_xp_per_day=max_xp_per_day,
    )
    db.commit()

    return GameSessionRegisterResponse(
        profile=UserGameProfileOut(
            id=result.profile.id,
            userId=result.profile.user_id,
            xp=result.profile.xp,
            level=result.profile.level,
            axionCoins=result.profile.axion_coins,
            dailyXp=result.profile.daily_xp,
            lastXpReset=result.profile.last_xp_reset,
            createdAt=result.profile.created_at,
            updatedAt=result.profile.updated_at,
        ),
        session=GameSessionOut(
            id=result.session.id,
            userId=result.session.user_id,
            gameType=result.session.game_type.value,
            score=result.session.score,
            xpEarned=result.session.xp_earned,
            coinsEarned=result.session.coins_earned,
            createdAt=result.session.created_at,
        ),
        dailyLimit=DailyXpLimitOut(
            maxXpPerDay=result.max_xp_per_day,
            grantedXp=result.granted_xp,
            requestedXp=result.requested_xp,
            remainingXpToday=result.remaining_xp_today,
        ),
        unlockedAchievements=result.unlocked_achievements,
    )
