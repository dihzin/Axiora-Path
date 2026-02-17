from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import ChildProfile, Membership, Recommendation, Tenant, User
from app.schemas.recommendations import DismissRecommendationResponse, RecommendationOut

router = APIRouter(tags=["recommendations"])


@router.get("/recommendations", response_model=list[RecommendationOut])
def list_recommendations(
    child_id: Annotated[int, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> list[RecommendationOut]:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    recommendations = db.scalars(
        select(Recommendation)
        .where(Recommendation.child_id == child_id)
        .order_by(Recommendation.created_at.desc(), Recommendation.id.desc()),
    ).all()
    return [
        RecommendationOut(
            id=item.id,
            child_id=item.child_id,
            type=item.type,
            title=item.title,
            body=item.body,
            severity=item.severity,
            created_at=item.created_at,
            dismissed_at=item.dismissed_at,
        )
        for item in recommendations
    ]


@router.post("/recommendations/{recommendation_id}/dismiss", response_model=DismissRecommendationResponse)
def dismiss_recommendation(
    recommendation_id: int,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> DismissRecommendationResponse:
    recommendation = db.scalar(
        select(Recommendation)
        .join(ChildProfile, ChildProfile.id == Recommendation.child_id)
        .where(
            Recommendation.id == recommendation_id,
            ChildProfile.tenant_id == tenant.id,
        ),
    )
    if recommendation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recommendation not found")

    recommendation.dismissed_at = datetime.now(UTC)
    events.emit(
        type="recommendation.dismissed",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=recommendation.child_id,
        payload={"recommendation_id": recommendation.id},
    )
    db.commit()
    return DismissRecommendationResponse(message="Recommendation dismissed")
