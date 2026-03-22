from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_user
from app.models import ToolTemplate, User
from app.schemas.tools_templates import (
    ToolTemplateCreateRequest,
    ToolTemplateDuplicateOut,
    ToolTemplateOut,
)

router = APIRouter(prefix="/api/tools/templates", tags=["tools-templates"])


def _to_out(tpl: ToolTemplate) -> ToolTemplateOut:
    return ToolTemplateOut.model_validate(tpl)


@router.post("", response_model=ToolTemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: ToolTemplateCreateRequest,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ToolTemplateOut:
    tpl = ToolTemplate(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name=payload.name,
        config=payload.config,
        blocks=payload.blocks,
        is_public=payload.is_public,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return _to_out(tpl)


@router.get("", response_model=list[ToolTemplateOut])
def list_templates(
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[ToolTemplateOut]:
    templates = db.scalars(
        select(ToolTemplate)
        .where(ToolTemplate.user_id == user.id)
        .order_by(ToolTemplate.created_at.desc()),
    ).all()
    return [_to_out(t) for t in templates]


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: str,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    tpl = db.scalar(
        select(ToolTemplate).where(
            ToolTemplate.id == template_id,
            ToolTemplate.user_id == user.id,
        ),
    )
    if tpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    db.delete(tpl)
    db.commit()


@router.post("/{template_id}/duplicate", response_model=ToolTemplateDuplicateOut, status_code=status.HTTP_201_CREATED)
def duplicate_template(
    template_id: str,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ToolTemplateDuplicateOut:
    tpl = db.scalar(
        select(ToolTemplate).where(
            ToolTemplate.id == template_id,
            ToolTemplate.user_id == user.id,
        ),
    )
    if tpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    duplicated = ToolTemplate(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name=f"{tpl.name} (cópia)",
        config=tpl.config,
        blocks=tpl.blocks,
        is_public=False,
    )
    db.add(duplicated)
    db.commit()
    db.refresh(duplicated)
    return ToolTemplateDuplicateOut.model_validate(duplicated)


@router.get("/public", response_model=list[ToolTemplateOut])
def list_public_templates(
    db: DBSession,
) -> list[ToolTemplateOut]:
    templates = db.scalars(
        select(ToolTemplate)
        .where(ToolTemplate.is_public.is_(True))
        .order_by(ToolTemplate.created_at.desc()),
    ).all()
    return [_to_out(t) for t in templates]
