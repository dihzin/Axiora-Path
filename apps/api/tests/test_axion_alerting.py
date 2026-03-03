from __future__ import annotations

from app.services import axion_alerting


def test_alert_retry_on_failure(monkeypatch) -> None:
    attempts = {"count": 0}
    sleeps: list[int] = []

    monkeypatch.setattr(axion_alerting.settings, "axion_alert_webhook_url", "https://alerts.example/webhook")
    monkeypatch.setattr(axion_alerting.time, "sleep", lambda value: sleeps.append(int(value)))

    def _fake_send(_url: str, _payload: dict, *, timeout_seconds: int = 5) -> None:
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise RuntimeError("transient_failure")
        return None

    monkeypatch.setattr(axion_alerting, "_send_webhook_request", _fake_send)

    sent = axion_alerting.send_axion_operational_alert(
        event_type="experiment_auto_paused",
        experiment_key="nba_retention_v1",
        metric_snapshot={"reason": "guardrail"},
        severity="critical",
    )

    assert sent is True
    assert attempts["count"] == 3
    assert sleeps == [1, 2]
