from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AxionContentCatalog


def _parse_csv_tags(raw: str | None) -> set[str]:
    return {item.strip().lower() for item in str(raw or "").split(",") if item.strip()}


def _resolve_age_bucket(age: int) -> str:
    if age < 10:
        return "lt10"
    if age <= 12:
        return "10_12"
    if age <= 15:
        return "13_15"
    return "16_18"


def _resolve_blocked_tags_for_age(age: int) -> set[str]:
    try:
        payload = json.loads(settings.axion_safety_age_policy_json or "{}")
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        return set()
    blocked = payload.get(_resolve_age_bucket(int(age)), [])
    if not isinstance(blocked, list):
        return set()
    return {str(item).strip().lower() for item in blocked if str(item).strip()}


def filter_candidates_by_safety_tags(
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

    allowed_tags = _parse_csv_tags(settings.axion_safety_allowed_tags_csv)
    blocked_for_age = _resolve_blocked_tags_for_age(int(child_age))

    rows = db.scalars(
        select(AxionContentCatalog).where(
            AxionContentCatalog.content_id.in_(ids),
            AxionContentCatalog.is_active.is_(True),
        )
    ).all()
    if len(rows) == 0:
        return []

    eligible: list[int] = []
    for row in rows:
        raw_tags = list(getattr(row, "safety_tags", []) or [])
        tags = {str(item).strip().lower() for item in raw_tags if str(item).strip()}
        if any(tag not in allowed_tags for tag in tags):
            continue
        if any(tag in blocked_for_age for tag in tags):
            continue
        eligible.append(int(row.content_id))
    return eligible

