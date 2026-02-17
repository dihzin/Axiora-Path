from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import date
from typing import Any

from app.core.logging import setup_json_logging
from app.jobs.axion_daily_refresh import refresh_axion_profiles_daily
from app.db.session import SessionLocal
from app.jobs.purge_deleted_data import purge_deleted_data
from app.jobs.weekly_summary import generate_weekly_summaries
from app.services.queue import JobEnvelope, dequeue_job

setup_json_logging()
logger = logging.getLogger("axiora.api.worker")


def _handle_weekly_summary(payload: dict[str, Any]) -> dict[str, Any]:
    reference_date: date | None = None
    raw_reference_date = payload.get("reference_date")
    if isinstance(raw_reference_date, str):
        reference_date = date.fromisoformat(raw_reference_date)

    db = SessionLocal()
    try:
        summaries = generate_weekly_summaries(db, reference_date=reference_date)
        db.commit()
        return {"generated": len(summaries)}
    finally:
        db.close()


def _handle_purge_deleted_data(_payload: dict[str, Any]) -> dict[str, Any]:
    db = SessionLocal()
    try:
        result = purge_deleted_data(db)
        db.commit()
        return result
    finally:
        db.close()


def _handle_axion_daily_refresh(_payload: dict[str, Any]) -> dict[str, Any]:
    db = SessionLocal()
    try:
        result = refresh_axion_profiles_daily(db)
        db.commit()
        return result
    finally:
        db.close()


JOB_HANDLERS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "weekly.summary.generate": _handle_weekly_summary,
    "purge.deleted_data": _handle_purge_deleted_data,
    "axion.mood.refresh.daily": _handle_axion_daily_refresh,
}


def process_job(job: JobEnvelope) -> None:
    handler = JOB_HANDLERS.get(job.type)
    if handler is None:
        logger.warning(
            "worker.job.unknown",
            extra={"job_id": job.id, "job_type": job.type},
        )
        return

    result = handler(job.payload)
    logger.info(
        "worker.job.completed",
        extra={"job_id": job.id, "job_type": job.type, "result": result},
    )


def run_worker() -> None:
    logger.info("worker.started")
    while True:
        job = dequeue_job(block_timeout_seconds=5)
        if job is None:
            continue

        try:
            process_job(job)
        except Exception:
            logger.exception(
                "worker.job.failed",
                extra={"job_id": job.id, "job_type": job.type},
            )


if __name__ == "__main__":
    run_worker()
