from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class ExportTaskOut(BaseModel):
    id: int
    tenant_id: int
    title: str
    description: str | None
    difficulty: str
    weight: int
    is_active: bool


class ExportTaskLogOut(BaseModel):
    id: int
    tenant_id: int
    child_id: int
    task_id: int
    date: date
    status: str
    created_at: datetime
    decided_at: datetime | None
    decided_by_user_id: int | None
    parent_comment: str | None


class ExportLedgerTransactionOut(BaseModel):
    id: int
    tenant_id: int
    wallet_id: int
    type: str
    amount_cents: int
    metadata: dict[str, object]
    created_at: datetime


class ExportStreakOut(BaseModel):
    child_id: int
    current: int
    last_date: date | None
    freeze_used_today: bool
    freeze_tokens: int


class ExportGoalOut(BaseModel):
    id: int
    tenant_id: int
    child_id: int
    title: str
    target_cents: int
    image_url: str | None
    is_locked: bool
    created_at: datetime


class ExportRecommendationOut(BaseModel):
    id: int
    child_id: int
    type: str
    title: str
    body: str
    severity: str
    created_at: datetime
    dismissed_at: datetime | None


class ExportMoodOut(BaseModel):
    child_id: int
    date: date
    mood: str


class ExportDataResponse(BaseModel):
    tasks: list[ExportTaskOut]
    logs: list[ExportTaskLogOut]
    wallet_transactions: list[ExportLedgerTransactionOut]
    streak: ExportStreakOut | None
    goals: list[ExportGoalOut]
    recommendations: list[ExportRecommendationOut]
    mood_history: list[ExportMoodOut]
