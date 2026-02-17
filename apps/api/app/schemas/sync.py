from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


class SyncBatchItem(BaseModel):
    id: str
    type: Literal["routine.mark", "coach.use", "daily_mission.complete"]
    payload: dict[str, Any]
    createdAt: datetime


class SyncBatchRequest(BaseModel):
    items: list[SyncBatchItem]


class SyncBatchFailedItem(BaseModel):
    id: str
    type: str
    error: str


class SyncBatchResponse(BaseModel):
    processed: int
    failed: list[SyncBatchFailedItem]
