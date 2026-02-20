from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.core.security import verify_password
from app.models import ChildProfile, Membership, Tenant, User
from app.schemas.children import ChildCreateRequest, ChildDeleteRequest, ChildOut, ChildThemeResponse, ChildThemeUpdateRequest, ChildUpdateRequest

router = APIRouter(prefix="/children", tags=["children"])
MAX_AVATAR_DATA_URL_CHARS = 1_500_000


def _sanitize_avatar_key(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    value = raw_value.strip()
    if not value:
        return None
    if value.startswith("data:image/"):
        if len(value) > MAX_AVATAR_DATA_URL_CHARS:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Imagem muito grande. Use até 1MB.")
        return value
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Formato de imagem inválido.")


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
        avatar_key=_sanitize_avatar_key(payload.avatar_key),
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
    child.avatar_key = _sanitize_avatar_key(payload.avatar_key)
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


@router.delete("/{child_id}")
def delete_child(
    child_id: int,
    payload: ChildDeleteRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> dict[str, bool]:
    if not tenant.parent_pin_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent PIN not configured")
    if not verify_password(payload.pin, tenant.parent_pin_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="PIN invalido")

    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    remaining_active = db.scalar(
        select(func.count(ChildProfile.id)).where(
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        )
    )
    if int(remaining_active or 0) <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao e possivel excluir a unica crianca vinculada")

    child.deleted_at = datetime.now(UTC)
    events.emit(
        type="child.deleted",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=child.id,
        payload={"child_id": child.id},
    )
    db.commit()
    return {"deleted": True}
