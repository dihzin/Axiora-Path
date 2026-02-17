from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, require_role
from app.models import AuditLog, Membership, Tenant
from app.schemas.audit import AuditLogOut

router = APIRouter(tags=["audit"])


@router.get("/audit", response_model=list[AuditLogOut])
def list_audit_logs(
    tenant_id: Annotated[int, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT"]))],
) -> list[AuditLogOut]:
    if tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

    logs = db.scalars(
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant.id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc()),
    ).all()

    return [
        AuditLogOut(
            id=log.id,
            tenant_id=log.tenant_id,
            actor_user_id=log.actor_user_id,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            metadata=log.metadata_json,
            created_at=log.created_at,
        )
        for log in logs
    ]
