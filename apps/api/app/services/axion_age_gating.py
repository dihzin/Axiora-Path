from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AxionContentCatalog, ChildProfile
from app.services.child_age import get_child_age


def resolve_child_age(
    db: Session,
    *,
    child_id: int | None,
    child_age: int | None = None,
) -> int | None:
    # Keep parameter for backward compatibility with callers/tests, but never trust
    # externally provided age. Canonical source is child.date_of_birth.
    _ = child_age
    if child_id is None or not hasattr(db, "scalar"):
        return None
    date_of_birth = db.scalar(select(ChildProfile.date_of_birth).where(ChildProfile.id == child_id))
    if date_of_birth is None:
        return None
    return get_child_age(date_of_birth, today=datetime.now(UTC).date())


def filter_candidate_content_ids_by_age(
    db: Session,
    *,
    candidate_content_ids: list[int],
    child_age: int,
) -> list[int]:
    ids = [int(item) for item in candidate_content_ids if item is not None]
    if len(ids) == 0:
        return []
    if not hasattr(db, "scalars"):
        return ids
    eligible = db.scalars(
        select(AxionContentCatalog.content_id).where(
            AxionContentCatalog.content_id.in_(ids),
            AxionContentCatalog.is_active.is_(True),
            AxionContentCatalog.age_min <= int(child_age),
            AxionContentCatalog.age_max >= int(child_age),
        )
    ).all()
    return [int(item) for item in eligible]
