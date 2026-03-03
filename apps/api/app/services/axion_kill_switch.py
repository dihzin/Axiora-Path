from __future__ import annotations

from threading import Lock

from app.core.config import settings

_LOCK = Lock()
_RUNTIME_OVERRIDE: bool | None = None


def is_axion_kill_switch_enabled() -> bool:
    with _LOCK:
        if _RUNTIME_OVERRIDE is not None:
            return bool(_RUNTIME_OVERRIDE)
    return bool(settings.axion_kill_switch)


def set_axion_kill_switch(*, enabled: bool) -> bool:
    with _LOCK:
        global _RUNTIME_OVERRIDE
        _RUNTIME_OVERRIDE = bool(enabled)
        return bool(_RUNTIME_OVERRIDE)


def get_axion_kill_switch_status() -> dict[str, object]:
    with _LOCK:
        runtime_override = _RUNTIME_OVERRIDE
    if runtime_override is not None:
        return {
            "enabled": bool(runtime_override),
            "source": "runtime_override",
            "envDefault": bool(settings.axion_kill_switch),
        }
    return {
        "enabled": bool(settings.axion_kill_switch),
        "source": "env",
        "envDefault": bool(settings.axion_kill_switch),
    }

