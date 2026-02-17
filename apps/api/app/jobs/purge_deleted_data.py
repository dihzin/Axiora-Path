from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models import ChildProfile, Task, Tenant


def purge_deleted_data(db: Session) -> dict[str, int]:
    """Placeholder job for future hard-delete pipeline."""
    cutoff = datetime.now(UTC) - timedelta(days=settings.data_retention_days)

    tenant_candidates = db.scalar(
        select(func.count(Tenant.id)).where(Tenant.deleted_at.is_not(None), Tenant.deleted_at < cutoff),
    )
    child_candidates = db.scalar(
        select(func.count(ChildProfile.id)).where(
            ChildProfile.deleted_at.is_not(None),
            ChildProfile.deleted_at < cutoff,
        ),
    )
    task_candidates = db.scalar(
        select(func.count(Task.id)).where(Task.deleted_at.is_not(None), Task.deleted_at < cutoff),
    )

    # Placeholder only:
    # - collect purge candidates by retention policy
    # - future iteration can implement cascaded hard-delete safely
    return {
        "tenants": int(tenant_candidates or 0),
        "child_profiles": int(child_candidates or 0),
        "tasks": int(task_candidates or 0),
    }


def run_purge_placeholder() -> dict[str, int]:
    db = SessionLocal()
    try:
        return purge_deleted_data(db)
    finally:
        db.close()
