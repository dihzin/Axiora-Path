from __future__ import annotations

from datetime import UTC, datetime, timedelta
import hashlib
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AxionContentCatalog, ChildContentHistory

_OUTCOME_INCORRECT = "incorrect"


def compute_content_fingerprint(*, normalized_text: str, content_type: str, subject: str) -> str:
    text = re.sub(r"\s+", " ", str(normalized_text or "").strip().lower())
    payload = f"{text}|{str(content_type or '').strip().lower()}|{str(subject or '').strip().lower()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def filter_repeated_candidates(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    candidate_content_ids: list[int],
    mode: str | None = None,
    window_days: int | None = None,
    review_cooldown_hours: int | None = None,
) -> list[int]:
    ids = [int(item) for item in candidate_content_ids if item is not None]
    if len(ids) == 0:
        return []
    if not hasattr(db, "scalars"):
        return ids

    lookback_days = max(1, int(window_days or settings.axion_content_repeat_window_days))
    review_cooldown = max(1, int(review_cooldown_hours or settings.axion_content_review_cooldown_hours))
    now = datetime.now(UTC)
    window_start = now - timedelta(days=lookback_days)
    review_cutoff = now - timedelta(hours=review_cooldown)
    review_mode = str(mode or "").strip().lower() == "review"

    catalog_rows = db.scalars(
        select(AxionContentCatalog).where(
            AxionContentCatalog.content_id.in_(ids),
            AxionContentCatalog.is_active.is_(True),
        )
    ).all()
    if len(catalog_rows) == 0:
        return []
    fingerprint_by_content_id = {int(item.content_id): str(item.content_fingerprint) for item in catalog_rows}
    fingerprints = list({value for value in fingerprint_by_content_id.values() if value})
    if len(fingerprints) == 0:
        return []

    history_rows = db.scalars(
        select(ChildContentHistory)
        .where(
            ChildContentHistory.tenant_id == tenant_id,
            ChildContentHistory.child_id == child_id,
            ChildContentHistory.content_fingerprint.in_(fingerprints),
            ChildContentHistory.served_at >= window_start,
        )
        .order_by(ChildContentHistory.served_at.desc())
    ).all()
    latest_by_fingerprint: dict[str, ChildContentHistory] = {}
    for row in history_rows:
        key = str(row.content_fingerprint or "")
        if key and key not in latest_by_fingerprint:
            latest_by_fingerprint[key] = row

    eligible: list[int] = []
    for content_id in ids:
        fingerprint = fingerprint_by_content_id.get(content_id)
        if not fingerprint:
            continue
        latest = latest_by_fingerprint.get(fingerprint)
        if latest is None:
            eligible.append(content_id)
            continue
        if not review_mode:
            continue
        outcome = str(latest.outcome or "").strip().lower()
        if outcome == _OUTCOME_INCORRECT and latest.served_at <= review_cutoff:
            eligible.append(content_id)
    return eligible

