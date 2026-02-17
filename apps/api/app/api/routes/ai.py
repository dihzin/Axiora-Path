from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import ChildProfile, DailyMood, EventLog, Membership, Recommendation, SavingGoal, Streak, TaskLog, TaskLogStatus, Tenant, User
from app.schemas.ai import CoachRequest, CoachResponse
from app.services.ai.adapters import CoachContext
from app.services.ai.factory import get_coach_adapter

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/coach", response_model=CoachResponse)
def ai_coach(
    payload: CoachRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> CoachResponse:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == payload.child_id,
            ChildProfile.tenant_id == tenant.id,
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    recent_events = db.scalars(
        select(EventLog)
        .where(
            EventLog.tenant_id == tenant.id,
            EventLog.child_id == payload.child_id,
        )
        .order_by(EventLog.created_at.desc(), EventLog.id.desc())
        .limit(30),
    ).all()

    active_recommendations = db.scalars(
        select(Recommendation)
        .where(
            Recommendation.child_id == payload.child_id,
            Recommendation.dismissed_at.is_(None),
        )
        .order_by(Recommendation.created_at.desc(), Recommendation.id.desc()),
    ).all()

    latest_mood = db.scalar(
        select(DailyMood)
        .where(DailyMood.child_id == payload.child_id)
        .order_by(DailyMood.date.desc()),
    )

    streak = db.get(Streak, payload.child_id)

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    week_logs = db.scalars(
        select(TaskLog).where(
            TaskLog.tenant_id == tenant.id,
            TaskLog.child_id == payload.child_id,
            TaskLog.date >= week_start,
            TaskLog.date <= week_end,
        ),
    ).all()
    week_approved = sum(1 for item in week_logs if item.status == TaskLogStatus.APPROVED)
    weekly_completion_rate = (week_approved / len(week_logs) * 100) if week_logs else 0.0

    active_goals = db.scalars(
        select(SavingGoal).where(
            SavingGoal.tenant_id == tenant.id,
            SavingGoal.child_id == payload.child_id,
        ),
    ).all()

    adapter = get_coach_adapter("rule_based")
    result = adapter.generate(
        CoachContext(
            mode=payload.mode,
            message=payload.message,
            events=recent_events,
            recommendations=active_recommendations,
            last_mood=latest_mood.mood if latest_mood is not None else None,
            streak_current=streak.current if streak is not None else 0,
            freeze_used_today=streak.freeze_used_today if streak is not None else False,
            weekly_completion_rate=weekly_completion_rate,
            active_saving_goals_count=len(active_goals),
        ),
    )

    events.emit(
        type="ai.coach.used",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=payload.child_id,
        payload={"mode": payload.mode, "has_message": payload.message is not None},
    )
    db.commit()

    return CoachResponse(
        reply=result.reply,
        suggested_actions=result.suggested_actions,
        tone=result.tone,
    )
