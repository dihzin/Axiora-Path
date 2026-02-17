from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import ChildProfile, Membership, Tenant, User
from app.schemas.children import ChildThemeResponse, ChildThemeUpdateRequest

router = APIRouter(prefix="/children", tags=["children"])


@router.put("/{child_id}/theme", response_model=ChildThemeResponse)
def update_child_theme(
    child_id: int,
    payload: ChildThemeUpdateRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> ChildThemeResponse:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    child.theme = payload.theme
    events.emit(
        type="child.theme.updated",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=child.id,
        payload={"theme": payload.theme},
    )
    db.commit()
    return ChildThemeResponse(child_id=child.id, theme=payload.theme)
