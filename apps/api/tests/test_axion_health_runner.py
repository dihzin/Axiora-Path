from __future__ import annotations

from datetime import UTC, datetime, timedelta
import hashlib
import hmac
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route
from app.jobs import axion_experiment_health_runner as jobs_mod
from app.models import AxionHealthRunnerHeartbeat, AxionHealthRunnerTriggerLog, EventLog
from app.services import axion_experiment_health_runner as runner_mod
from app.services.axion_experiment_health_runner import AxionExperimentHealthRunner, ExperimentRunItem, RunReport


class _ScalarRows:
    def __init__(self, values: list[str]) -> None:
        self._values = values

    def all(self) -> list[str]:
        return self._values


class _FakeDB:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0
        self.executes = 0
        self.added: list[object] = []

    def scalars(self, *_args, **_kwargs) -> _ScalarRows:
        return _ScalarRows(["nba_retention_v1"])

    def scalar(self, *_args, **_kwargs):
        return 1

    def get(self, *_args, **_kwargs):
        return None

    def add(self, value: object) -> None:
        self.added.append(value)

    def execute(self, *_args, **_kwargs):
        self.executes += 1
        return None

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1

    def close(self) -> None:
        return


class _FakeJobScalarRows:
    def __init__(self, values) -> None:
        self._values = values

    def all(self):
        return list(self._values)


class _FakeJobDB:
    def __init__(self) -> None:
        self.heartbeats: list[AxionHealthRunnerHeartbeat] = []
        self.events: list[EventLog] = []

    def add(self, value) -> None:
        if isinstance(value, AxionHealthRunnerHeartbeat):
            self.heartbeats.append(value)
            return
        if isinstance(value, EventLog):
            self.events.append(value)
            return

    def flush(self) -> None:
        return

    def scalar(self, *_args, **_kwargs):
        return 1

    def scalars(self, *_args, **_kwargs):
        ordered = sorted(self.heartbeats, key=lambda item: item.ran_at, reverse=True)
        return _FakeJobScalarRows(ordered[:3])

    def commit(self) -> None:
        return

    def rollback(self) -> None:
        return

    def close(self) -> None:
        return


class _FakeRuntimeRows:
    def __init__(self, row: dict[str, object] | None) -> None:
        self._row = row

    def mappings(self) -> "_FakeRuntimeRows":
        return self

    def first(self) -> dict[str, object] | None:
        return self._row


class _FakeRuntimeDB:
    def __init__(self, ran_at: datetime | None) -> None:
        self._ran_at = ran_at

    def execute(self, *_args, **_kwargs) -> _FakeRuntimeRows:
        row = {"ran_at": self._ran_at} if self._ran_at is not None else None
        return _FakeRuntimeRows(row)


class _FakeCronAuthDB:
    def __init__(self, last_external_trigger_at: datetime | None) -> None:
        self._last_external_trigger_at = last_external_trigger_at

    def execute(self, *_args, **_kwargs) -> _FakeRuntimeRows:
        return _FakeRuntimeRows({"last_external_trigger_at": self._last_external_trigger_at})


class _FakeTriggerLogRows:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return list(self._rows)

    def first(self):
        if isinstance(self._rows, list):
            return self._rows[0] if self._rows else None
        return self._rows


class _FakeTriggerLogDB:
    def __init__(self, rows: list[dict[str, object]], failures_last_24h: int) -> None:
        self.rows = rows
        self.failures_last_24h = failures_last_24h

    def execute(self, stmt, *_args, **_kwargs):
        sql = str(stmt)
        if "COUNT(*)::int AS failures_last_24h" in sql:
            return _FakeTriggerLogRows({"failures_last_24h": self.failures_last_24h})
        return _FakeTriggerLogRows(self.rows)


def test_health_runner_runs_pause_before_scale(monkeypatch) -> None:
    db = _FakeDB()
    calls: list[str] = []
    monkeypatch.setattr(runner_mod, "_resolve_health_runner_enabled", lambda: True)
    monkeypatch.setattr(runner_mod, "lock_experiment_for_update", lambda *_args, **_kwargs: True)

    def _fake_health(*_args, **_kwargs):
        calls.append("pause")
        return SimpleNamespace(paused=False, reasons=[], metrics={})

    def _fake_scale(*_args, **_kwargs):
        calls.append("scale")
        return SimpleNamespace(scaled=True, reason="rollout_scaled", previous_rollout_percent=5, new_rollout_percent=10)

    monkeypatch.setattr(runner_mod, "evaluate_experiment_health", _fake_health)
    monkeypatch.setattr(runner_mod, "evaluate_rollout_progression", _fake_scale)
    runner = AxionExperimentHealthRunner(db, respect_enabled_flag=True)
    report = runner.run_all(active_only=True)

    assert calls == ["pause", "scale"]
    assert report.experiments_processed == 1
    assert report.paused_count == 0
    assert report.scaled_count == 1


def test_health_runner_idempotent(monkeypatch) -> None:
    db = _FakeDB()
    scale_calls = {"count": 0}
    monkeypatch.setattr(runner_mod, "_resolve_health_runner_enabled", lambda: True)
    monkeypatch.setattr(runner_mod, "lock_experiment_for_update", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(
        runner_mod,
        "evaluate_experiment_health",
        lambda *_args, **_kwargs: SimpleNamespace(paused=True, reasons=["negative_lift_guardrail"], metrics={}),
    )

    def _fake_scale(*_args, **_kwargs):
        scale_calls["count"] += 1
        return SimpleNamespace(scaled=False, reason="skipped", previous_rollout_percent=10, new_rollout_percent=10)

    monkeypatch.setattr(runner_mod, "evaluate_rollout_progression", _fake_scale)
    runner = AxionExperimentHealthRunner(db, respect_enabled_flag=True)
    first = runner.run_all(active_only=True)
    second = runner.run_all(active_only=True)

    assert first.paused_count == 1
    assert second.paused_count == 1
    assert first.scaled_count == 0
    assert second.scaled_count == 0
    assert scale_calls["count"] == 0


def test_health_runner_respects_enabled_flag(monkeypatch) -> None:
    db = _FakeDB()
    called = {"health": 0, "scale": 0}
    monkeypatch.setattr(runner_mod, "_resolve_health_runner_enabled", lambda: False)
    monkeypatch.setattr(
        runner_mod,
        "evaluate_experiment_health",
        lambda *_args, **_kwargs: called.__setitem__("health", int(called["health"]) + 1),
    )
    monkeypatch.setattr(
        runner_mod,
        "evaluate_rollout_progression",
        lambda *_args, **_kwargs: called.__setitem__("scale", int(called["scale"]) + 1),
    )

    report = AxionExperimentHealthRunner(db, respect_enabled_flag=True).run_all(active_only=True)
    assert report.enabled is False
    assert report.experiments_processed == 0
    assert called["health"] == 0
    assert called["scale"] == 0


def test_scale_not_applied_twice_under_concurrency(monkeypatch) -> None:
    db = _FakeDB()
    lock_calls = {"count": 0}
    scale_calls = {"count": 0}

    monkeypatch.setattr(runner_mod, "_resolve_health_runner_enabled", lambda: True)

    def _fake_lock(*_args, **_kwargs) -> bool:
        lock_calls["count"] += 1
        return lock_calls["count"] == 1

    monkeypatch.setattr(runner_mod, "lock_experiment_for_update", _fake_lock)
    monkeypatch.setattr(
        runner_mod,
        "evaluate_experiment_health",
        lambda *_args, **_kwargs: SimpleNamespace(paused=False, reasons=[], metrics={}),
    )

    def _fake_scale(*_args, **_kwargs):
        scale_calls["count"] += 1
        return SimpleNamespace(scaled=True, reason="rollout_scaled", previous_rollout_percent=5, new_rollout_percent=10)

    monkeypatch.setattr(runner_mod, "evaluate_rollout_progression", _fake_scale)
    runner = AxionExperimentHealthRunner(db, respect_enabled_flag=True)
    first = runner.run_all(active_only=True)
    second = runner.run_all(active_only=True)

    assert first.scaled_count == 1
    assert second.scaled_count == 0
    assert scale_calls["count"] == 1


def test_pause_and_scale_do_not_conflict(monkeypatch) -> None:
    db = _FakeDB()
    scale_calls = {"count": 0}

    monkeypatch.setattr(runner_mod, "_resolve_health_runner_enabled", lambda: True)
    monkeypatch.setattr(runner_mod, "lock_experiment_for_update", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(
        runner_mod,
        "evaluate_experiment_health",
        lambda *_args, **_kwargs: SimpleNamespace(paused=True, reasons=["negative_lift_guardrail"], metrics={}),
    )

    def _fake_scale(*_args, **_kwargs):
        scale_calls["count"] += 1
        return SimpleNamespace(scaled=True, reason="rollout_scaled", previous_rollout_percent=5, new_rollout_percent=10)

    monkeypatch.setattr(runner_mod, "evaluate_rollout_progression", _fake_scale)
    report = AxionExperimentHealthRunner(db, respect_enabled_flag=True).run_all(active_only=True)

    assert report.paused_count == 1
    assert report.scaled_count == 0
    assert scale_calls["count"] == 0


def test_health_runner_endpoint_admin_only(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    app.dependency_overrides[deps.get_db] = lambda: _FakeDB()
    client = TestClient(app)
    response = client.post("/admin/experiments/health/run", json={})
    assert response.status_code == 403

    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secret", "secret123")
    monkeypatch.setattr(
        axion_route,
        "_run_health_runner_with_timeout",
        lambda **_kwargs: axion_route.AxionHealthRunnerReport(
            startedAt=datetime.now(UTC),
            completedAt=datetime.now(UTC),
            durationMs=5,
            enabled=True,
            activeOnly=True,
            experimentsTotal=1,
            experimentsAttempted=1,
            experimentsProcessed=1,
            experimentsSkippedLocked=0,
            pausedCount=0,
            scaledCount=1,
            results=[],
        ),
    )
    response = client.post("/admin/experiments/health/run", json={"activeOnly": True}, headers={"X-CRON-SECRET": "secret123"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["experimentsProcessed"] == 1
    assert payload["scaledCount"] == 1


def test_cron_secret_allows_execution(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    app.dependency_overrides[deps.get_db] = lambda: _FakeDB()
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secret", "cron-secret")
    monkeypatch.setattr(
        axion_route,
        "_run_health_runner_with_timeout",
        lambda **_kwargs: axion_route.AxionHealthRunnerReport(
            startedAt=datetime.now(UTC),
            completedAt=datetime.now(UTC),
            durationMs=3,
            enabled=True,
            activeOnly=True,
            experimentsTotal=0,
            experimentsAttempted=0,
            experimentsProcessed=0,
            experimentsSkippedLocked=0,
            pausedCount=0,
            scaledCount=0,
            results=[],
        ),
    )
    client = TestClient(app)
    response = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "cron-secret"})
    assert response.status_code == 200


def test_invalid_secret_rejected(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    app.dependency_overrides[deps.get_db] = lambda: _FakeDB()
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secret", "cron-secret")
    client = TestClient(app)
    response = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "bad-secret"})
    assert response.status_code == 403


def test_multiple_secrets_accepts_any(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    app.dependency_overrides[deps.get_db] = lambda: _FakeDB()
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secrets", "secret-a,secret-b")
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secret", "legacy-secret")
    monkeypatch.setattr(
        axion_route,
        "_run_health_runner_with_timeout",
        lambda **_kwargs: axion_route.AxionHealthRunnerReport(
            startedAt=datetime.now(UTC),
            completedAt=datetime.now(UTC),
            durationMs=2,
            enabled=True,
            activeOnly=True,
            experimentsTotal=0,
            experimentsAttempted=0,
            experimentsProcessed=0,
            experimentsSkippedLocked=0,
            pausedCount=0,
            scaledCount=0,
            results=[],
        ),
    )
    client = TestClient(app)
    first = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "secret-a"})
    second = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "secret-b"})
    legacy = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "legacy-secret"})
    assert first.status_code == 200
    assert second.status_code == 200
    # When list is configured, legacy single-secret must be ignored.
    assert legacy.status_code == 403


def test_legacy_secret_still_works(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    app.dependency_overrides[deps.get_db] = lambda: _FakeDB()
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secrets", None)
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secret", "legacy-secret")
    monkeypatch.setattr(
        axion_route,
        "_run_health_runner_with_timeout",
        lambda **_kwargs: axion_route.AxionHealthRunnerReport(
            startedAt=datetime.now(UTC),
            completedAt=datetime.now(UTC),
            durationMs=2,
            enabled=True,
            activeOnly=True,
            experimentsTotal=0,
            experimentsAttempted=0,
            experimentsProcessed=0,
            experimentsSkippedLocked=0,
            pausedCount=0,
            scaledCount=0,
            results=[],
        ),
    )
    client = TestClient(app)
    response = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "legacy-secret"})
    assert response.status_code == 200


def test_auth_status_endpoint(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    now = datetime.now(UTC)
    app.dependency_overrides[deps.get_db] = lambda: _FakeCronAuthDB(now)
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=1, email="admin@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="TEACHER"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secrets", "secret-a,secret-b")
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secret", "legacy-secret")

    client = TestClient(app)
    response = client.get("/admin/experiments/health/cron_auth_status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["secretsConfiguredCount"] == 2
    assert payload["legacySingleSecretEnabled"] is False
    assert payload["lastExternalTriggerAt"] is not None
    assert payload["status"] == "OK"

    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secrets", "")
    warn = client.get("/admin/experiments/health/cron_auth_status")
    assert warn.status_code == 200
    warn_payload = warn.json()
    assert warn_payload["secretsConfiguredCount"] == 0
    assert warn_payload["legacySingleSecretEnabled"] is True
    assert warn_payload["status"] == "WARN"


def test_rate_limit_blocks_after_threshold(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    fake_db = _FakeDB()
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secrets", "secret-a")
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_allowlist", None)
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_rate_limit_max", 2)
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_rate_limit_window_seconds", 600)
    monkeypatch.setattr(axion_route, "_CRON_RATE_LIMIT_STATE", {})
    monkeypatch.setattr(
        axion_route,
        "_run_health_runner_with_timeout",
        lambda **_kwargs: axion_route.AxionHealthRunnerReport(
            startedAt=datetime.now(UTC),
            completedAt=datetime.now(UTC),
            durationMs=2,
            enabled=True,
            activeOnly=True,
            experimentsTotal=0,
            experimentsAttempted=0,
            experimentsProcessed=0,
            experimentsSkippedLocked=0,
            pausedCount=0,
            scaledCount=0,
            results=[],
        ),
    )

    source = "cron-prod-a"
    sig = hmac.new(b"secret-a", source.encode("utf-8"), hashlib.sha256).hexdigest()
    header_value = f"{source}:{sig}"
    client = TestClient(app)
    first = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "secret-a", "X-CRON-SOURCE": header_value})
    second = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "secret-a", "X-CRON-SOURCE": header_value})
    third = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "secret-a", "X-CRON-SOURCE": header_value})

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 429
    assert any(getattr(item, "type", "") == "health_runner_rate_limited" for item in fake_db.added)


def test_allowlist_rejects_non_allowed(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    fake_db = _FakeDB()
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secrets", "secret-a")
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_allowlist", "allowed-source")
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_rate_limit_max", 10)
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_rate_limit_window_seconds", 600)
    monkeypatch.setattr(axion_route, "_CRON_RATE_LIMIT_STATE", {})
    monkeypatch.setattr(
        axion_route,
        "_run_health_runner_with_timeout",
        lambda **_kwargs: axion_route.AxionHealthRunnerReport(
            startedAt=datetime.now(UTC),
            completedAt=datetime.now(UTC),
            durationMs=2,
            enabled=True,
            activeOnly=True,
            experimentsTotal=0,
            experimentsAttempted=0,
            experimentsProcessed=0,
            experimentsSkippedLocked=0,
            pausedCount=0,
            scaledCount=0,
            results=[],
        ),
    )

    source = "not-allowed"
    sig = hmac.new(b"secret-a", source.encode("utf-8"), hashlib.sha256).hexdigest()
    header_value = f"{source}:{sig}"
    client = TestClient(app)
    response = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "secret-a", "X-CRON-SOURCE": header_value})
    assert response.status_code == 403
    assert any(getattr(item, "type", "") == "health_runner_allowlist_rejected" for item in fake_db.added)


def test_allowlist_allows_allowed(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    fake_db = _FakeDB()
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secrets", "secret-a")
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_allowlist", "allowed-source")
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_rate_limit_max", 10)
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_rate_limit_window_seconds", 600)
    monkeypatch.setattr(axion_route, "_CRON_RATE_LIMIT_STATE", {})
    monkeypatch.setattr(
        axion_route,
        "_run_health_runner_with_timeout",
        lambda **_kwargs: axion_route.AxionHealthRunnerReport(
            startedAt=datetime.now(UTC),
            completedAt=datetime.now(UTC),
            durationMs=2,
            enabled=True,
            activeOnly=True,
            experimentsTotal=0,
            experimentsAttempted=0,
            experimentsProcessed=0,
            experimentsSkippedLocked=0,
            pausedCount=0,
            scaledCount=0,
            results=[],
        ),
    )

    source = "allowed-source"
    sig = hmac.new(b"secret-a", source.encode("utf-8"), hashlib.sha256).hexdigest()
    header_value = f"{source}:{sig}"
    client = TestClient(app)
    response = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "secret-a", "X-CRON-SOURCE": header_value})
    assert response.status_code == 200
    assert not any(getattr(item, "type", "") == "health_runner_allowlist_rejected" for item in fake_db.added)


def test_starvation_warning_emitted_after_3_runs(monkeypatch) -> None:
    fake_db = _FakeJobDB()
    monkeypatch.setattr(jobs_mod, "_resolve_health_runner_enabled", lambda: True)
    monkeypatch.setattr(jobs_mod, "SessionLocal", lambda: fake_db)

    class _FakeRunner:
        def __init__(self, *_args, **_kwargs) -> None:
            return

        def run_all(self, active_only: bool = True) -> RunReport:
            now = datetime.now(UTC)
            return RunReport(
                started_at=now,
                completed_at=now,
                duration_ms=4,
                enabled=True,
                active_only=active_only,
                experiments_total=10,
                experiments_attempted=10,
                experiments_processed=6,
                experiments_skipped_locked=4,
                paused_count=0,
                scaled_count=0,
                results=[],
            )

    monkeypatch.setattr(jobs_mod, "AxionExperimentHealthRunner", _FakeRunner)
    jobs_mod.run_axion_experiment_health_once()
    jobs_mod.run_axion_experiment_health_once()
    jobs_mod.run_axion_experiment_health_once()

    warning_events = [item for item in fake_db.events if item.type == "health_runner_lock_starvation_warning"]
    assert len(fake_db.heartbeats) == 3
    assert len(warning_events) == 1


def test_starvation_not_triggered_below_threshold(monkeypatch) -> None:
    fake_db = _FakeJobDB()
    monkeypatch.setattr(jobs_mod, "_resolve_health_runner_enabled", lambda: True)
    monkeypatch.setattr(jobs_mod, "SessionLocal", lambda: fake_db)

    class _FakeRunner:
        def __init__(self, *_args, **_kwargs) -> None:
            return

        def run_all(self, active_only: bool = True) -> RunReport:
            now = datetime.now(UTC)
            return RunReport(
                started_at=now,
                completed_at=now,
                duration_ms=4,
                enabled=True,
                active_only=active_only,
                experiments_total=10,
                experiments_attempted=10,
                experiments_processed=8,
                experiments_skipped_locked=2,
                paused_count=0,
                scaled_count=0,
                results=[],
            )

    monkeypatch.setattr(jobs_mod, "AxionExperimentHealthRunner", _FakeRunner)
    jobs_mod.run_axion_experiment_health_once()
    jobs_mod.run_axion_experiment_health_once()
    jobs_mod.run_axion_experiment_health_once()

    warning_events = [item for item in fake_db.events if item.type == "health_runner_lock_starvation_warning"]
    assert len(fake_db.heartbeats) == 3
    assert len(warning_events) == 0


def test_runtime_status_ok(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    now = datetime.now(UTC)
    app.dependency_overrides[deps.get_db] = lambda: _FakeRuntimeDB(now)
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=1, email="admin@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="TEACHER"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)
    monkeypatch.setattr(axion_route, "_resolve_health_runner_mode", lambda: "external")
    monkeypatch.setattr(axion_route, "_runner_interval_minutes", lambda: 1)

    client = TestClient(app)
    response = client.get("/admin/experiments/health/runtime_status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["schedulerMode"] == "external"
    assert payload["status"] == "OK"
    assert payload["lastHeartbeatAt"] is not None
    assert payload["nextExpectedRunAt"] is not None


def test_runtime_status_warn(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    now = datetime.now(UTC)
    app.dependency_overrides[deps.get_db] = lambda: _FakeRuntimeDB(now.replace(microsecond=0) - timedelta(seconds=70))
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=1, email="admin@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="TEACHER"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)
    monkeypatch.setattr(axion_route, "_resolve_health_runner_mode", lambda: "external")
    monkeypatch.setattr(axion_route, "_runner_interval_minutes", lambda: 1)

    client = TestClient(app)
    response = client.get("/admin/experiments/health/runtime_status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "WARN"
    assert payload["heartbeatLagSeconds"] > 60


def test_runtime_status_critical(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    now = datetime.now(UTC)
    app.dependency_overrides[deps.get_db] = lambda: _FakeRuntimeDB(now.replace(microsecond=0) - timedelta(seconds=130))
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=1, email="admin@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="TEACHER"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)
    monkeypatch.setattr(axion_route, "_resolve_health_runner_mode", lambda: "external")
    monkeypatch.setattr(axion_route, "_runner_interval_minutes", lambda: 1)

    client = TestClient(app)
    response = client.get("/admin/experiments/health/runtime_status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "CRITICAL"
    assert payload["heartbeatLagSeconds"] > 120


def test_trigger_log_records_success(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    fake_db = _FakeDB()
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secrets", "secret-a")
    monkeypatch.setattr(
        axion_route,
        "_run_health_runner_with_timeout",
        lambda **_kwargs: axion_route.AxionHealthRunnerReport(
            startedAt=datetime.now(UTC),
            completedAt=datetime.now(UTC),
            durationMs=4,
            enabled=True,
            activeOnly=True,
            experimentsTotal=1,
            experimentsAttempted=1,
            experimentsProcessed=1,
            experimentsSkippedLocked=0,
            pausedCount=0,
            scaledCount=0,
            results=[],
        ),
    )

    source = "ops-trigger"
    sig = hmac.new(b"secret-a", source.encode("utf-8"), hashlib.sha256).hexdigest()
    client = TestClient(app)
    response = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "secret-a", "X-CRON-SOURCE": f"{source}:{sig}"})
    assert response.status_code == 200
    assert any(isinstance(item, AxionHealthRunnerTriggerLog) and item.status == "SUCCESS" for item in fake_db.added)


def test_trigger_log_records_failure(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)
    fake_db = _FakeDB()
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    monkeypatch.setattr(axion_route.settings, "axion_health_runner_cron_secrets", "secret-a")
    monkeypatch.setattr(
        axion_route,
        "_run_health_runner_with_timeout",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    source = "ops-trigger"
    sig = hmac.new(b"secret-a", source.encode("utf-8"), hashlib.sha256).hexdigest()
    client = TestClient(app)
    response = client.post("/admin/experiments/health/run", headers={"X-CRON-SECRET": "secret-a", "X-CRON-SOURCE": f"{source}:{sig}"})
    assert response.status_code == 500
    payload = response.json()
    assert payload["detail"]["error_code"] == "AXION_HEALTH_RUNNER_EXTERNAL_FAILED"
    assert any(isinstance(item, AxionHealthRunnerTriggerLog) and item.status == "FAIL" for item in fake_db.added)
    assert any(getattr(item, "type", "") == "health_runner_external_failed" for item in fake_db.added)


def test_trigger_log_status_warn_critical(monkeypatch) -> None:
    now = datetime.now(UTC)
    rows = [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "run_id": "22222222-2222-2222-2222-222222222222",
            "triggered_at": now,
            "status": "FAIL",
            "error_code": "AXION_HEALTH_RUNNER_EXTERNAL_FAILED",
            "error_message": "timeout",
            "duration_ms": 1500,
        }
    ]

    app = FastAPI()
    app.include_router(axion_route.router)
    app.dependency_overrides[deps.get_db] = lambda: _FakeTriggerLogDB(rows, failures_last_24h=3)
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=1, email="admin@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="TEACHER"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)

    client = TestClient(app)
    warn = client.get("/admin/experiments/health/trigger_log")
    assert warn.status_code == 200
    warn_payload = warn.json()
    assert warn_payload["failuresLast24h"] == 3
    assert warn_payload["status"] == "WARN"
    assert len(warn_payload["records"]) == 1

    app.dependency_overrides[deps.get_db] = lambda: _FakeTriggerLogDB(rows, failures_last_24h=10)
    critical = client.get("/admin/experiments/health/trigger_log")
    assert critical.status_code == 200
    critical_payload = critical.json()
    assert critical_payload["failuresLast24h"] == 10
    assert critical_payload["status"] == "CRITICAL"
