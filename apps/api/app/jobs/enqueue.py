from __future__ import annotations

from app.services.queue import enqueue_job


def enqueue_weekly_summary(reference_date: str | None = None) -> str:
    payload: dict[str, str] = {}
    if reference_date:
        payload["reference_date"] = reference_date
    return enqueue_job("weekly.summary.generate", payload=payload)


def enqueue_purge_deleted_data() -> str:
    return enqueue_job("purge.deleted_data", payload={})


def enqueue_axion_nightly(batch_size: int = 250, active_window_days: int = 45) -> str:
    return enqueue_job(
        "axion.nightly.run",
        payload={
            "batch_size": max(1, int(batch_size)),
            "active_window_days": max(1, int(active_window_days)),
        },
    )
