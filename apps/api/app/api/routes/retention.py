from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.models import Membership, Tenant, User
from app.schemas.retention import (
    ActiveSeasonEventsResponse,
    CalendarActivityDayOut,
    CalendarActivityResponse,
    MissionClaimRequest,
    MissionClaimResponse,
    MissionProgressOut,
    MissionsCurrentResponse,
    SeasonEventOut,
)
from app.services.learning_retention import (
    claim_mission_reward,
    get_active_season_events,
    get_calendar_activity_snapshot,
    get_current_missions_snapshot,
    get_upcoming_season_event,
)

router = APIRouter(prefix="/api", tags=["learning-retention"])


@router.get("/missions/current", response_model=MissionsCurrentResponse)
def get_current_missions(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> MissionsCurrentResponse:
    try:
        paired, meta = get_current_missions_snapshot(db, user_id=user.id, tenant_id=tenant.id)
    except SQLAlchemyError:
        db.rollback()
        return MissionsCurrentResponse(
            missions=[],
            currentStreak=0,
            longestStreak=0,
            almostThere=False,
            showNudge=False,
            nudgeMessage="",
            upcomingSeasonalEvent=None,
        )
    missions = [
        MissionProgressOut(
            missionId=str(mission.id),
            title=mission.title,
            description=mission.description,
            missionType=mission.mission_type,
            targetValue=mission.target_value,
            currentValue=progress.current_value,
            completed=progress.completed,
            completedAt=progress.completed_at,
            rewardGranted=progress.reward_granted,
            xpReward=mission.xp_reward,
            coinReward=mission.coin_reward,
            isSeasonal=mission.is_seasonal,
            themeKey=mission.theme_key,
            startDate=mission.start_date,
            endDate=mission.end_date,
            progressPercent=(
                min(100.0, round((float(progress.current_value) / float(mission.target_value)) * 100.0, 2))
                if mission.target_value > 0
                else 0.0
            ),
        )
        for mission, progress in paired
    ]
    db.commit()
    return MissionsCurrentResponse(
        missions=missions,
        currentStreak=meta["currentStreak"],
        longestStreak=meta["longestStreak"],
        almostThere=meta["almostThere"],
        showNudge=meta["showNudge"],
        nudgeMessage=meta["nudgeMessage"],
        upcomingSeasonalEvent=meta["upcomingSeasonalEvent"],
    )


@router.post("/missions/claim", response_model=MissionClaimResponse)
def claim_mission(
    payload: MissionClaimRequest,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> MissionClaimResponse:
    try:
        result = claim_mission_reward(db, user_id=user.id, mission_id=payload.mission_id)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mission service unavailable. Run latest migrations.",
        ) from None
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return MissionClaimResponse(
        missionId=result.mission_id,
        completed=result.completed,
        rewardGranted=result.reward_granted,
        xpReward=result.xp_reward,
        coinReward=result.coin_reward,
    )


@router.get("/events/active", response_model=ActiveSeasonEventsResponse)
def get_active_events(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    __: Annotated[User, Depends(get_current_user)],
    ___: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> ActiveSeasonEventsResponse:
    today = date.today()
    try:
        active = get_active_season_events(db, target_date=today)
        upcoming = get_upcoming_season_event(db, target_date=today)
    except SQLAlchemyError:
        db.rollback()
        return ActiveSeasonEventsResponse(active=[], upcoming=None, countdownDays=None)
    countdown_days = (upcoming.start_date - today).days if upcoming is not None else None
    return ActiveSeasonEventsResponse(
        active=[
            SeasonEventOut(
                id=str(item.id),
                name=item.name,
                themeKey=item.theme_key,
                startDate=item.start_date,
                endDate=item.end_date,
                description=item.description,
                backgroundStyle=item.background_style or {},
                bonusXpMultiplier=float(item.bonus_xp_multiplier),
                bonusCoinMultiplier=float(item.bonus_coin_multiplier),
            )
            for item in active
        ],
        upcoming=(
            SeasonEventOut(
                id=str(upcoming.id),
                name=upcoming.name,
                themeKey=upcoming.theme_key,
                startDate=upcoming.start_date,
                endDate=upcoming.end_date,
                description=upcoming.description,
                backgroundStyle=upcoming.background_style or {},
                bonusXpMultiplier=float(upcoming.bonus_xp_multiplier),
                bonusCoinMultiplier=float(upcoming.bonus_coin_multiplier),
            )
            if upcoming is not None
            else None
        ),
        countdownDays=countdown_days,
    )


@router.get("/calendar/activity", response_model=CalendarActivityResponse)
def get_calendar_activity(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    month: Annotated[int | None, Query()] = None,
    year: Annotated[int | None, Query()] = None,
) -> CalendarActivityResponse:
    today = date.today()
    selected_month = month or today.month
    selected_year = year or today.year
    try:
        rows, current_streak, longest_streak = get_calendar_activity_snapshot(
            db,
            user_id=user.id,
            month=selected_month,
            year=selected_year,
        )
    except SQLAlchemyError:
        db.rollback()
        rows, current_streak, longest_streak = [], 0, 0
    return CalendarActivityResponse(
        month=selected_month,
        year=selected_year,
        currentStreak=current_streak,
        longestStreak=longest_streak,
        days=[
            CalendarActivityDayOut(
                date=row.date,
                lessonsCompleted=row.lessons_completed,
                xpEarned=row.xp_earned,
                missionsCompleted=row.missions_completed,
                streakMaintained=row.streak_maintained,
                perfectSessions=row.perfect_sessions,
            )
            for row in rows
        ],
    )
