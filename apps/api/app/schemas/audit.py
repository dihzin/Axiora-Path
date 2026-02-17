from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    tenant_id: int
    actor_user_id: int
    action: str
    entity_type: str
    entity_id: int
    metadata: dict[str, object]
    created_at: datetime
