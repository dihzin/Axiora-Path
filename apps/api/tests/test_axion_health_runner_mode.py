from __future__ import annotations

import builtins

from app.jobs import axion_experiment_health_runner as jobs_mod


def test_runner_boot_does_not_require_apscheduler_in_external_mode(monkeypatch) -> None:
    monkeypatch.setattr(jobs_mod, "_resolve_health_runner_enabled", lambda: True)
    monkeypatch.setattr(jobs_mod, "_resolve_health_runner_mode", lambda: "external")

    original_import = builtins.__import__
    calls: dict[str, int] = {"apscheduler": 0}

    def _fake_import(name, globals=None, locals=None, fromlist=(), level=0):  # noqa: ANN001
        if str(name).startswith("apscheduler"):
            calls["apscheduler"] += 1
            raise ImportError("apscheduler unavailable")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", _fake_import)
    scheduler = jobs_mod.start_axion_experiment_health_scheduler()
    assert scheduler is None
    assert calls["apscheduler"] == 0


def test_internal_mode_requires_apscheduler(monkeypatch) -> None:
    monkeypatch.setattr(jobs_mod, "_resolve_health_runner_enabled", lambda: True)
    monkeypatch.setattr(jobs_mod, "_resolve_health_runner_mode", lambda: "internal")

    original_import = builtins.__import__
    calls: dict[str, int] = {"apscheduler": 0}

    def _fake_import(name, globals=None, locals=None, fromlist=(), level=0):  # noqa: ANN001
        if str(name).startswith("apscheduler"):
            calls["apscheduler"] += 1
            raise ImportError("apscheduler unavailable")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", _fake_import)
    scheduler = jobs_mod.start_axion_experiment_health_scheduler()
    assert scheduler is None
    assert calls["apscheduler"] == 1
