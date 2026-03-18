from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChildProfile, Membership, User


def resolve_child_context(
    db: Session,
    *,
    tenant_id: int,
    user: User,
    membership: Membership,
    requested_child_id: int | None,
) -> ChildProfile:
    if requested_child_id is not None:
        child = db.scalar(
            select(ChildProfile).where(
                ChildProfile.id == int(requested_child_id),
                ChildProfile.tenant_id == int(tenant_id),
                ChildProfile.deleted_at.is_(None),
            ),
        )
        if child is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found in this tenant")
        membership_role = membership.role.value if hasattr(membership.role, "value") else str(membership.role)
        if membership_role == "CHILD" and child.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Child user cannot access another child profile",
            )
        return child

    direct_child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.tenant_id == int(tenant_id),
            ChildProfile.user_id == int(user.id),
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if direct_child is not None:
        return direct_child

    children = db.scalars(
        select(ChildProfile).where(
            ChildProfile.tenant_id == int(tenant_id),
            ChildProfile.deleted_at.is_(None),
        ),
    ).all()
    if len(children) == 1:
        return children[0]
    if not children:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No child profile found for this tenant")
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Multiple children found. Provide childId explicitly.",
    )
