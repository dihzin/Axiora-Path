from __future__ import annotations

from datetime import UTC, datetime
import json
import logging
import time
from typing import Any
from urllib import error, request

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_webhook_request(url: str, payload: dict[str, Any], *, timeout_seconds: int = 5) -> None:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url=url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=max(1, int(timeout_seconds))) as response:
        status_code = getattr(response, "status", 200)
        if int(status_code) >= 400:
            raise RuntimeError(f"webhook_http_{status_code}")


def send_axion_operational_alert(
    *,
    event_type: str,
    experiment_key: str | None,
    metric_snapshot: dict[str, Any],
    severity: str = "warning",
    max_attempts: int = 3,
) -> bool:
    url = (settings.axion_alert_webhook_url or "").strip()
    if not url:
        return False

    payload = {
        "event_type": event_type,
        "severity": severity,
        "experiment_key": experiment_key,
        "environment": (settings.app_env or "unknown").strip().lower() or "unknown",
        "metric_snapshot": metric_snapshot,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    backoff_seconds = (1, 2)
    attempts = max(1, int(max_attempts))
    for attempt in range(1, attempts + 1):
        try:
            _send_webhook_request(url, payload)
            return True
        except Exception as exc:  # pragma: no cover - network failure branch
            logger.warning(
                "axion_alert_webhook_failed",
                extra={
                    "event_type": event_type,
                    "attempt": attempt,
                    "max_attempts": attempts,
                    "error": str(exc),
                },
            )
            if attempt >= attempts:
                break
            sleep_index = min(attempt - 1, len(backoff_seconds) - 1)
            time.sleep(backoff_seconds[sleep_index])
    return False
