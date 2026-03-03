from __future__ import annotations

from collections.abc import Callable
from collections import defaultdict
import logging
from threading import Lock

logger = logging.getLogger(__name__)

_LATENCY_BUCKETS_SECONDS = (0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)
_MASTERY_SCORE_BUCKETS = (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0)
_DEFAULT_MODE = "SHADOW"
_VALID_MODES = {"SHADOW", "CANARY", "ACTIVE", "ROLLED_BACK"}


class _InMemoryAxionMetrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self._decisions_total: dict[str, int] = defaultdict(int)
        self._errors_total: dict[str, int] = defaultdict(int)
        self._policy_serving_total: dict[str, int] = defaultdict(int)
        self._guardrails_block_total: dict[str, int] = defaultdict(int)
        self._guardrails_fallback_total: int = 0
        self._mastery_updates_total: dict[str, int] = defaultdict(int)
        self._mastery_score_histogram: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._prereq_unlock_total: int = 0
        self._llm_calls_total: int = 0
        self._llm_errors_total: dict[str, int] = defaultdict(int)
        self._llm_cache_hit_total: int = 0
        self._llm_kill_switch_triggered_total: int = 0
        self._latency_bucket_counts: dict[str, int] = defaultdict(int)
        self._latency_count: int = 0
        self._latency_sum_seconds: float = 0.0

    def inc_decisions(self, mode: str) -> None:
        normalized = str(mode or _DEFAULT_MODE).strip().upper()
        if normalized not in _VALID_MODES:
            normalized = _DEFAULT_MODE
        with self._lock:
            self._decisions_total[normalized] += 1

    def inc_errors(self, error_type: str) -> None:
        normalized = str(error_type or "unknown_error").strip() or "unknown_error"
        with self._lock:
            self._errors_total[normalized] += 1

    def observe_latency(self, seconds: float) -> None:
        value = max(0.0, float(seconds))
        with self._lock:
            self._latency_count += 1
            self._latency_sum_seconds += value
            placed = False
            for bucket in _LATENCY_BUCKETS_SECONDS:
                if value <= bucket:
                    self._latency_bucket_counts[str(bucket)] += 1
                    placed = True
                    break
            if not placed:
                self._latency_bucket_counts["+Inf"] += 1

    def inc_policy_serving(self, policy_version: int | str | None) -> None:
        normalized = str(policy_version if policy_version is not None else "unknown")
        with self._lock:
            self._policy_serving_total[normalized] += 1

    def inc_guardrails_block(self, reason: str) -> None:
        normalized = str(reason or "unknown").strip().lower() or "unknown"
        with self._lock:
            self._guardrails_block_total[normalized] += 1

    def inc_guardrails_fallback(self) -> None:
        with self._lock:
            self._guardrails_fallback_total += 1

    def inc_mastery_updates(self, subject: str) -> None:
        normalized = str(subject or "unknown").strip().lower() or "unknown"
        with self._lock:
            self._mastery_updates_total[normalized] += 1

    def observe_mastery_score(self, subject: str, score: float) -> None:
        normalized = str(subject or "unknown").strip().lower() or "unknown"
        value = max(0.0, min(1.0, float(score)))
        with self._lock:
            placed = False
            for bucket in _MASTERY_SCORE_BUCKETS:
                if value <= bucket:
                    self._mastery_score_histogram[normalized][str(bucket)] += 1
                    placed = True
                    break
            if not placed:
                self._mastery_score_histogram[normalized]["+Inf"] += 1

    def inc_prereq_unlock(self) -> None:
        with self._lock:
            self._prereq_unlock_total += 1

    def inc_llm_calls(self) -> None:
        with self._lock:
            self._llm_calls_total += 1

    def inc_llm_errors(self, error_type: str) -> None:
        normalized = str(error_type or "unknown_error").strip() or "unknown_error"
        with self._lock:
            self._llm_errors_total[normalized] += 1

    def inc_llm_cache_hit(self) -> None:
        with self._lock:
            self._llm_cache_hit_total += 1

    def inc_llm_kill_switch_triggered(self) -> None:
        with self._lock:
            self._llm_kill_switch_triggered_total += 1

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            decisions = dict(self._decisions_total)
            errors = dict(self._errors_total)
            policies = dict(self._policy_serving_total)
            guardrails_blocks = dict(self._guardrails_block_total)
            guardrails_fallback_total = int(self._guardrails_fallback_total)
            mastery_updates = dict(self._mastery_updates_total)
            mastery_histogram = {
                str(subject): {str(bucket): int(count) for bucket, count in dict(buckets).items()}
                for subject, buckets in dict(self._mastery_score_histogram).items()
            }
            prereq_unlock_total = int(self._prereq_unlock_total)
            llm_calls_total = int(self._llm_calls_total)
            llm_errors_total = dict(self._llm_errors_total)
            llm_cache_hit_total = int(self._llm_cache_hit_total)
            llm_kill_switch_triggered_total = int(self._llm_kill_switch_triggered_total)
            buckets = dict(self._latency_bucket_counts)
            latency_count = int(self._latency_count)
            latency_sum_seconds = float(self._latency_sum_seconds)

        return {
            "ready": True,
            "decisions_total": int(sum(decisions.values())),
            "errors_total": int(sum(errors.values())),
            "latency_observations": latency_count,
            "latency_sum_seconds": latency_sum_seconds,
            "policy_serving_total": int(sum(policies.values())),
            "guardrails_block_total": int(sum(guardrails_blocks.values())),
            "guardrails_fallback_total": guardrails_fallback_total,
            "mastery_updates_total": int(sum(mastery_updates.values())),
            "mastery_updates_by_subject": mastery_updates,
            "mastery_score_histogram": mastery_histogram,
            "prereq_unlock_total": prereq_unlock_total,
            "llm_calls_total": llm_calls_total,
            "llm_errors_total": int(sum(llm_errors_total.values())),
            "llm_error_types": llm_errors_total,
            "llm_cache_hit_total": llm_cache_hit_total,
            "llm_kill_switch_triggered_total": llm_kill_switch_triggered_total,
            "decision_modes": decisions,
            "error_types": errors,
            "policy_versions": policies,
            "guardrails_block_reasons": guardrails_blocks,
            "latency_buckets": buckets,
        }


_METRICS_BACKEND: _InMemoryAxionMetrics | None = _InMemoryAxionMetrics()


def _safe(operation: str, fn: Callable[[], None]) -> None:
    try:
        fn()
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.warning(
            "axion_metrics_operation_failed",
            extra={"operation": operation, "error": str(exc)},
        )


def safe_increment_decisions_total(mode: str) -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.inc_decisions(mode)

    _safe("axion_decisions_total", _run)


def safe_increment_errors_total(error_type: str) -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.inc_errors(error_type)

    _safe("axion_errors_total", _run)


def safe_observe_latency_seconds(seconds: float) -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.observe_latency(seconds)

    _safe("axion_latency_seconds_bucket", _run)


def safe_increment_policy_serving_total(policy_version: int | str | None) -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.inc_policy_serving(policy_version)

    _safe("axion_policy_serving_total", _run)


def safe_increment_guardrails_block_total(reason: str) -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.inc_guardrails_block(reason)

    _safe("axion_guardrails_block_total", _run)


def safe_increment_guardrails_fallback_total() -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.inc_guardrails_fallback()

    _safe("axion_guardrails_fallback_total", _run)


def safe_increment_mastery_updates_total(subject: str) -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.inc_mastery_updates(subject)

    _safe("axion_mastery_updates_total", _run)


def safe_observe_mastery_score(subject: str, score: float) -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.observe_mastery_score(subject, score)

    _safe("axion_mastery_score_histogram", _run)


def safe_increment_prereq_unlock_total() -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.inc_prereq_unlock()

    _safe("axion_prereq_unlock_total", _run)


def safe_increment_llm_calls_total() -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.inc_llm_calls()

    _safe("axion_llm_calls_total", _run)


def safe_increment_llm_errors_total(error_type: str) -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.inc_llm_errors(error_type)

    _safe("axion_llm_errors_total", _run)


def safe_increment_llm_cache_hit_total() -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.inc_llm_cache_hit()

    _safe("axion_llm_cache_hit_total", _run)


def safe_increment_llm_kill_switch_triggered() -> None:
    def _run() -> None:
        backend = _METRICS_BACKEND
        if backend is None:
            return
        backend.inc_llm_kill_switch_triggered()

    _safe("axion_llm_kill_switch_triggered", _run)


def get_axion_metrics_health() -> dict[str, object]:
    backend = _METRICS_BACKEND
    if backend is None:
        return {
            "ready": False,
            "decisions_total": 0,
            "errors_total": 0,
            "latency_observations": 0,
            "latency_sum_seconds": 0.0,
            "policy_serving_total": 0,
            "guardrails_block_total": 0,
            "guardrails_fallback_total": 0,
            "mastery_updates_total": 0,
            "mastery_updates_by_subject": {},
            "mastery_score_histogram": {},
            "prereq_unlock_total": 0,
            "llm_calls_total": 0,
            "llm_errors_total": 0,
            "llm_error_types": {},
            "llm_cache_hit_total": 0,
            "llm_kill_switch_triggered_total": 0,
            "decision_modes": {},
            "error_types": {},
            "policy_versions": {},
            "guardrails_block_reasons": {},
            "latency_buckets": {},
        }
    return backend.snapshot()


def get_axion_mastery_metrics_health() -> dict[str, object]:
    base = get_axion_metrics_health()
    return {
        "ready": bool(base.get("ready", False)),
        "mastery_updates_total": int(base.get("mastery_updates_total", 0) or 0),
        "mastery_updates_by_subject": dict(base.get("mastery_updates_by_subject", {}) or {}),
        "mastery_score_histogram": dict(base.get("mastery_score_histogram", {}) or {}),
        "prereq_unlock_total": int(base.get("prereq_unlock_total", 0) or 0),
    }
