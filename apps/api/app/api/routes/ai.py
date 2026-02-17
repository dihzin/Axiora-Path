from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import ChildProfile, EventLog, Membership, Recommendation, Tenant, User
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

    adapter = get_coach_adapter("rule_based")
    result = adapter.generate(
        CoachContext(
            mode=payload.mode,
            message=payload.message,
            events=recent_events,
            recommendations=active_recommendations,
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

