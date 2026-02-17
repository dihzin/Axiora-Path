from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FeatureFlag

DEFAULT_FEATURE_NAMES: tuple[str, ...] = ("ai_coach_v2", "gamification_v2")


def is_feature_enabled(name: str, db: Session, *, tenant_id: int | None = None) -> bool:
    if tenant_id is not None:
        tenant_override = db.scalar(
            select(FeatureFlag).where(
                FeatureFlag.name == name,
                FeatureFlag.tenant_id == tenant_id,
            ),
        )
        if tenant_override is not None:
            return bool(tenant_override.enabled_globally)

    global_flag = db.scalar(
        select(FeatureFlag).where(
            FeatureFlag.name == name,
            FeatureFlag.tenant_id.is_(None),
        ),
    )
    if global_flag is None:
        return False
    return bool(global_flag.enabled_globally)
