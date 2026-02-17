from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, require_role
from app.models import ChildProfile, Membership, Tenant
from app.schemas.axion import AxionStateResponse
from app.services.axion import compute_axion_state

router = APIRouter(tags=["axion"])


@router.get("/axion/state", response_model=AxionStateResponse)
def get_axion_state(
    child_id: Annotated[int, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> AxionStateResponse:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    profile, traits = compute_axion_state(
        db,
        tenant_id=tenant.id,
        child_id=child_id,
        xp_total=child.xp_total,
    )
    db.commit()
    return AxionStateResponse(
        stage=profile.stage,
        mood_state=profile.mood_state,
        personality_traits=traits,
    )
