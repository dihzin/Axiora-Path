from __future__ import annotations

from app.services.queue import enqueue_job


def enqueue_weekly_summary(reference_date: str | None = None) -> str:
    payload: dict[str, str] = {}
    if reference_date:
        payload["reference_date"] = reference_date
    return enqueue_job("weekly.summary.generate", payload=payload)


def enqueue_purge_deleted_data() -> str:
    return enqueue_job("purge.deleted_data", payload={})
