from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import logging
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AxionExperiment
from app.services.axion_auto_rollback import evaluate_auto_rollback
from app.services.axion_experiment_health import evaluate_experiment_health, evaluate_rollout_progression, lock_experiment_for_update

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ExperimentRunItem:
    experiment_key: str
    paused: bool
    pause_reasons: list[str]
    scaled: bool
    scale_reason: str
    previous_rollout_percent: int | None = None
    new_rollout_percent: int | None = None
    error: str | None = None


@dataclass(slots=True)
class RunReport:
    started_at: datetime
    completed_at: datetime
    duration_ms: int
    enabled: bool
    active_only: bool
    experiments_total: int
    experiments_attempted: int
    experiments_processed: int
    experiments_skipped_locked: int
    paused_count: int
    scaled_count: int
    results: list[ExperimentRunItem]


def _resolve_health_runner_enabled() -> bool:
    configured = settings.axion_health_runner_enabled
    if configured is not None:
        return bool(configured)
    env = (settings.app_env or "").strip().lower()
    if env in {"production", "staging"}:
        return True
    return False


class AxionExperimentHealthRunner:
    def __init__(self, db: Session, *, respect_enabled_flag: bool = True) -> None:
        self.db = db
        self.respect_enabled_flag = respect_enabled_flag

    def _list_experiment_keys(self, *, active_only: bool) -> list[str]:
        stmt = select(AxionExperiment.experiment_id).distinct().order_by(AxionExperiment.experiment_id.asc())
        if active_only:
            stmt = stmt.where(AxionExperiment.active.is_(True))
        return [str(item) for item in self.db.scalars(stmt).all()]

    def _run_experiment(self, experiment_key: str) -> ExperimentRunItem:
        run_id = str(uuid4())
        try:
            if not lock_experiment_for_update(self.db, experiment_key=experiment_key, skip_locked=True):
                return ExperimentRunItem(
                    experiment_key=experiment_key,
                    paused=False,
                    pause_reasons=[],
                    scaled=False,
                    scale_reason="locked_skip",
                )
            auto_rollback = evaluate_auto_rollback(
                self.db,
                experiment_key=experiment_key,
                auto_commit=False,
            )
            if auto_rollback.rolled_back:
                self._mark_health_run(experiment_key=experiment_key, run_id=run_id, reason="auto_rollback")
                self.db.commit()
                return ExperimentRunItem(
                    experiment_key=experiment_key,
                    paused=True,
                    pause_reasons=list(auto_rollback.reasons),
                    scaled=False,
                    scale_reason="skipped_due_to_auto_rollback",
                )
            health = evaluate_experiment_health(
                self.db,
                experiment_key=experiment_key,
                lock_experiment=False,
                auto_commit=False,
            )
            if health.paused:
                self._mark_health_run(experiment_key=experiment_key, run_id=run_id, reason="paused")
                self.db.commit()
                return ExperimentRunItem(
                    experiment_key=experiment_key,
                    paused=True,
                    pause_reasons=list(health.reasons),
                    scaled=False,
                    scale_reason="skipped_due_to_pause",
                )

            scale = evaluate_rollout_progression(
                self.db,
                experiment_key=experiment_key,
                lock_experiment=False,
                auto_commit=False,
            )
            self._mark_health_run(experiment_key=experiment_key, run_id=run_id, reason=scale.reason)
            self.db.commit()
            return ExperimentRunItem(
                experiment_key=experiment_key,
                paused=False,
                pause_reasons=[],
                scaled=bool(scale.scaled),
                scale_reason=scale.reason,
                previous_rollout_percent=scale.previous_rollout_percent,
                new_rollout_percent=scale.new_rollout_percent,
            )
        except Exception as exc:  # pragma: no cover - defensive branch
            self.db.rollback()
            logger.exception(
                "health_runner_experiment_failed",
                extra={"experiment_key": experiment_key},
            )
            return ExperimentRunItem(
                experiment_key=experiment_key,
                paused=False,
                pause_reasons=[],
                scaled=False,
                scale_reason="error",
                error=str(exc),
            )

    def _mark_health_run(self, *, experiment_key: str, run_id: str, reason: str) -> None:
        self.db.execute(
            update(AxionExperiment)
            .where(AxionExperiment.experiment_id == experiment_key)
            .values(
                last_health_run_at=datetime.now(UTC),
                last_health_run_id=run_id,
                last_health_run_reason=reason,
            )
        )

    def run_all(self, active_only: bool = True) -> RunReport:
        started_at = datetime.now(UTC)
        enabled = _resolve_health_runner_enabled() if self.respect_enabled_flag else True
        if not enabled:
            completed_at = datetime.now(UTC)
            return RunReport(
                started_at=started_at,
                completed_at=completed_at,
                duration_ms=max(0, int((completed_at - started_at).total_seconds() * 1000)),
                enabled=False,
                active_only=active_only,
                experiments_total=0,
                experiments_attempted=0,
                experiments_processed=0,
                experiments_skipped_locked=0,
                paused_count=0,
                scaled_count=0,
                results=[],
            )

        logger.info(
            "health_runner_started",
            extra={"active_only": active_only},
        )
        keys = self._list_experiment_keys(active_only=active_only)
        return self.run_selected(keys, active_only=active_only, started_at=started_at, enabled=enabled)

    def run_selected(
        self,
        experiment_keys: list[str],
        *,
        active_only: bool,
        started_at: datetime | None = None,
        enabled: bool | None = None,
    ) -> RunReport:
        run_started_at = started_at or datetime.now(UTC)
        run_enabled = _resolve_health_runner_enabled() if enabled is None else enabled
        if not run_enabled:
            completed_at = datetime.now(UTC)
            return RunReport(
                started_at=run_started_at,
                completed_at=completed_at,
                duration_ms=max(0, int((completed_at - run_started_at).total_seconds() * 1000)),
                enabled=False,
                active_only=active_only,
                experiments_total=0,
                experiments_attempted=0,
                experiments_processed=0,
                experiments_skipped_locked=0,
                paused_count=0,
                scaled_count=0,
                results=[],
            )

        results = [self._run_experiment(key) for key in experiment_keys]
        skipped_locked = sum(1 for item in results if item.scale_reason == "locked_skip")
        processed = max(0, len(experiment_keys) - skipped_locked)
        paused_count = sum(1 for item in results if item.paused)
        scaled_count = sum(1 for item in results if item.scaled)
        completed_at = datetime.now(UTC)
        report = RunReport(
            started_at=run_started_at,
            completed_at=completed_at,
            duration_ms=max(0, int((completed_at - run_started_at).total_seconds() * 1000)),
            enabled=True,
            active_only=active_only,
            experiments_total=len(experiment_keys),
            experiments_attempted=len(experiment_keys),
            experiments_processed=processed,
            experiments_skipped_locked=skipped_locked,
            paused_count=paused_count,
            scaled_count=scaled_count,
            results=results,
        )
        logger.info(
            "health_runner_completed",
            extra={
                "active_only": active_only,
                "experiments_total": report.experiments_total,
                "experiments_attempted": report.experiments_attempted,
                "experiments_processed": report.experiments_processed,
                "experiments_skipped_locked": report.experiments_skipped_locked,
                "paused_count": report.paused_count,
                "scaled_count": report.scaled_count,
                "duration_ms": report.duration_ms,
            },
        )
        return report
