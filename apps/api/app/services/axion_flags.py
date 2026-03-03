from __future__ import annotations

from sqlalchemy import inspect, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import ChildProfile

_has_nba_flag_column_cache: bool | None = None


def _has_nba_flag_column(db: Session) -> bool:
    global _has_nba_flag_column_cache
    if _has_nba_flag_column_cache is not None:
        return _has_nba_flag_column_cache
    try:
        columns = inspect(db.bind).get_columns("child_profiles")
        _has_nba_flag_column_cache = any(str(item.get("name")) == "axion_nba_enabled" for item in columns)
    except Exception:
        _has_nba_flag_column_cache = False
    return _has_nba_flag_column_cache


def is_nba_enabled(db: Session, *, child_id: int | None) -> bool:
    if child_id is None or child_id <= 0:
        return True
    if not _has_nba_flag_column(db):
        return True
    try:
        enabled = db.scalar(
            select(ChildProfile.axion_nba_enabled).where(
                ChildProfile.id == child_id,
                ChildProfile.deleted_at.is_(None),
            )
        )
    except SQLAlchemyError:
        return True
    if enabled is None:
        return True
    return bool(enabled)
