from __future__ import annotations

from datetime import UTC, datetime
import logging
from uuid import uuid4

from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models import AxionHealthRunnerHeartbeat, EventLog, Tenant
from app.services.axion_alerting import send_axion_operational_alert
from app.services.axion_experiment_health_runner import AxionExperimentHealthRunner, _resolve_health_runner_enabled

logger = logging.getLogger(__name__)


def _runner_interval_minutes() -> int:
    env = (settings.app_env or "").strip().lower()
    if env == "production":
        return 60
    if env == "staging":
        return 15
    return 15


def _resolve_health_runner_mode() -> str:
    configured = (settings.axion_health_runner_mode or "").strip().lower()
    if configured in {"internal", "external"}:
        return configured
    env = (settings.app_env or "").strip().lower()
    if env in {"production", "staging"}:
        return "external"
    return "internal"


def _lock_skip_rate(*, attempted: int, skipped_locked: int) -> float:
    if attempted <= 0:
        return 0.0
    return float(skipped_locked) / float(attempted)


def _is_lock_starvation_window(rows: list[AxionHealthRunnerHeartbeat]) -> tuple[bool, float]:
    if len(rows) < 3:
        return (False, 0.0)
    rates = [
        _lock_skip_rate(
            attempted=int(item.experiments_attempted or 0),
            skipped_locked=int(item.experiments_skipped_locked or 0),
        )
        for item in rows[:3]
    ]
    rolling = sum(rates) / 3.0
    return (all(rate > 0.30 for rate in rates), rolling)


def _resolve_telemetry_tenant_id(db) -> int | None:
    tenant_id = db.scalar(select(Tenant.id).order_by(Tenant.id.asc()).limit(1))
    return int(tenant_id) if tenant_id is not None else None


def _write_heartbeat_and_alert(
    db,
    *,
    run_id: str,
    started_at: datetime,
    experiments_attempted: int,
    experiments_processed: int,
    experiments_skipped_locked: int,
    duration_ms: int,
) -> None:
    now = datetime.now(UTC)
    env = (settings.app_env or "unknown").strip().lower() or "unknown"
    heartbeat = AxionHealthRunnerHeartbeat(
        run_id=run_id,
        environment=env,
        ran_at=now,
        experiments_attempted=max(0, int(experiments_attempted)),
        experiments_processed=max(0, int(experiments_processed)),
        experiments_skipped_locked=max(0, int(experiments_skipped_locked)),
        duration_ms=max(0, int(duration_ms)),
    )
    db.add(heartbeat)
    db.flush()

    recent = db.scalars(
        select(AxionHealthRunnerHeartbeat)
        .where(AxionHealthRunnerHeartbeat.environment == env)
        .order_by(AxionHealthRunnerHeartbeat.ran_at.desc())
        .limit(3)
    ).all()
    starvation, rolling_rate = _is_lock_starvation_window(list(recent))
    if starvation:
        telemetry_tenant_id = _resolve_telemetry_tenant_id(db)
        if telemetry_tenant_id is not None:
            db.add(
                EventLog(
                    tenant_id=telemetry_tenant_id,
                    actor_user_id=None,
                    child_id=None,
                    type="health_runner_lock_starvation_warning",
                    payload={
                        "run_id": run_id,
                        "environment": env,
                        "started_at": started_at.isoformat(),
                        "attempted": max(0, int(experiments_attempted)),
                        "skipped_locked": max(0, int(experiments_skipped_locked)),
                        "rolling_lock_skip_rate_last_3": round(rolling_rate, 6),
                        "timestamp": now.isoformat(),
                    },
                )
            )
            send_axion_operational_alert(
                event_type="health_runner_lock_starvation_warning",
                experiment_key=None,
                metric_snapshot={
                    "run_id": run_id,
                    "attempted": max(0, int(experiments_attempted)),
                    "skipped_locked": max(0, int(experiments_skipped_locked)),
                    "rolling_lock_skip_rate_last_3": round(rolling_rate, 6),
                },
                severity="critical",
            )
    db.commit()


def run_axion_experiment_health_once() -> None:
    if not _resolve_health_runner_enabled():
        logger.info("health_runner_disabled")
        return
    started_at = datetime.now(UTC)
    run_id = str(uuid4())
    logger.info("health_runner_started", extra={"source": "scheduler"})
    db = SessionLocal()
    try:
        report = None
        try:
            report = AxionExperimentHealthRunner(db, respect_enabled_flag=True).run_all(active_only=True)
        except Exception:
            logger.exception("health_runner_execution_failed", extra={"source": "scheduler", "run_id": run_id})
            db.rollback()

        attempted = int(report.experiments_attempted) if report is not None else 0
        processed = int(report.experiments_processed) if report is not None else 0
        skipped_locked = int(report.experiments_skipped_locked) if report is not None else 0
        duration_ms = int(report.duration_ms) if report is not None else max(0, int((datetime.now(UTC) - started_at).total_seconds() * 1000))
        _write_heartbeat_and_alert(
            db,
            run_id=run_id,
            started_at=started_at,
            experiments_attempted=attempted,
            experiments_processed=processed,
            experiments_skipped_locked=skipped_locked,
            duration_ms=duration_ms,
        )

        logger.info(
            "health_runner_completed",
            extra={
                "source": "scheduler",
                "run_id": run_id,
                "experiments_total": report.experiments_total if report is not None else 0,
                "experiments_attempted": attempted,
                "experiments_processed": processed,
                "experiments_skipped_locked": skipped_locked,
                "paused_count": report.paused_count if report is not None else 0,
                "scaled_count": report.scaled_count if report is not None else 0,
                "duration_ms": duration_ms,
            },
        )
    finally:
        db.close()
        logger.info(
            "health_runner_finished",
            extra={
                "source": "scheduler",
                "run_id": run_id,
                "duration_ms": max(0, int((datetime.now(UTC) - started_at).total_seconds() * 1000)),
            },
        )


def start_axion_experiment_health_scheduler():
    if not _resolve_health_runner_enabled():
        logger.info("health_runner_scheduler_not_started", extra={"reason": "disabled"})
        return None
    mode = _resolve_health_runner_mode()
    if mode != "internal":
        logger.info("health_runner_scheduler_not_started", extra={"reason": "external_mode"})
        return None
    interval_minutes = _runner_interval_minutes()
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
    except Exception:  # pragma: no cover - optional dependency fallback
        logger.info("health_runner_scheduler_not_started", extra={"reason": "internal_mode_missing_apscheduler"})
        return None

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        run_axion_experiment_health_once,
        "interval",
        minutes=interval_minutes,
        id="axion_experiment_health_runner",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )
    scheduler.start()
    logger.info("health_runner_scheduler_started", extra={"interval_minutes": interval_minutes})
    return scheduler
