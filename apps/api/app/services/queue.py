from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from redis import Redis

from app.core.config import settings


@dataclass(frozen=True)
class JobEnvelope:
    id: str
    type: str
    payload: dict[str, Any]
    created_at: str


def _redis_client() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True, encoding="utf-8")


def enqueue_job(job_type: str, payload: dict[str, Any] | None = None) -> str:
    job = JobEnvelope(
        id=str(uuid4()),
        type=job_type,
        payload=payload or {},
        created_at=datetime.now(UTC).isoformat(),
    )
    client = _redis_client()
    try:
        client.rpush(settings.queue_name, json.dumps(job.__dict__, ensure_ascii=True))
    finally:
        client.close()
    return job.id


def dequeue_job(block_timeout_seconds: int = 5) -> JobEnvelope | None:
    client = _redis_client()
    try:
        result = client.blpop(settings.queue_name, timeout=block_timeout_seconds)
    finally:
        client.close()

    if result is None:
        return None
    _queue_name, raw_job = result
    data = json.loads(raw_job)
    return JobEnvelope(
        id=str(data["id"]),
        type=str(data["type"]),
        payload=dict(data.get("payload") or {}),
        created_at=str(data["created_at"]),
    )
