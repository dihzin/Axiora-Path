from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import ChildProfile, Membership, Tenant, User
from app.schemas.children import ChildCreateRequest, ChildOut, ChildThemeResponse, ChildThemeUpdateRequest, ChildUpdateRequest

router = APIRouter(prefix="/children", tags=["children"])


@router.get("", response_model=list[ChildOut])
def list_children(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> list[ChildOut]:
    children = db.scalars(
        select(ChildProfile)
        .where(
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        )
        .order_by(ChildProfile.id.asc()),
    ).all()
    return [
        ChildOut(
            id=child.id,
            display_name=child.display_name,
            avatar_key=child.avatar_key,
            birth_year=child.birth_year,
            theme=child.theme,
            avatar_stage=child.avatar_stage,
        )
        for child in children
    ]


@router.post("", response_model=ChildOut, status_code=status.HTTP_201_CREATED)
def create_child(
    payload: ChildCreateRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> ChildOut:
    child = ChildProfile(
        tenant_id=tenant.id,
        display_name=payload.display_name,
        avatar_key=None,
        birth_year=payload.birth_year,
        theme=payload.theme,
    )
    db.add(child)
    db.flush()
    events.emit(
        type="child.created",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=child.id,
        payload={"child_id": child.id},
    )
    db.commit()
    return ChildOut(
        id=child.id,
        display_name=child.display_name,
        avatar_key=child.avatar_key,
        birth_year=child.birth_year,
        theme=child.theme,
        avatar_stage=child.avatar_stage,
    )


@router.put("/{child_id}", response_model=ChildOut)
def update_child(
    child_id: int,
    payload: ChildUpdateRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> ChildOut:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    child.display_name = payload.display_name
    child.birth_year = payload.birth_year
    child.theme = payload.theme
    events.emit(
        type="child.updated",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=child.id,
        payload={"child_id": child.id},
    )
    db.commit()
    return ChildOut(
        id=child.id,
        display_name=child.display_name,
        avatar_key=child.avatar_key,
        birth_year=child.birth_year,
        theme=child.theme,
        avatar_stage=child.avatar_stage,
    )


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
