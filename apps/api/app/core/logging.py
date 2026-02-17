from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from app.core.config import settings


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "service": "axiora-api",
            "environment": settings.app_env,
        }

        optional_fields = (
            "request_id",
            "tenant_id",
            "user_id",
            "child_id",
            "mission_id",
            "mission_rarity",
            "xp_reward",
            "coin_reward",
            "completion_rate",
            "total_missions",
            "completed_missions",
            "route",
            "method",
            "status_code",
            "execution_time_ms",
            "provider_targets",
        )
        for field in optional_fields:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=True)


def setup_json_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)
