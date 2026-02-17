from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class WalletSummaryResponse(BaseModel):
    child_id: int
    wallet_id: int
    currency_code: str
    total_balance_cents: int
    pot_balances_cents: dict[str, int]


class AllowanceRunRequest(BaseModel):
    child_id: int
    amount_cents: int = Field(gt=0)


class LedgerTransactionOut(BaseModel):
    id: int
    type: str
    amount_cents: int
    metadata: dict[str, object]
    created_at: datetime


class GoalCreateRequest(BaseModel):
    child_id: int
    title: str
    target_cents: int = Field(gt=0)
    image_url: str | None = None
    is_locked: bool = False


class GoalOut(BaseModel):
    id: int
    child_id: int
    title: str
    target_cents: int
    image_url: str | None
    is_locked: bool
    created_at: datetime


class GoalProjectionResponse(BaseModel):
    goal_id: int
    child_id: int
    target_cents: int
    saved_cents: int
    remaining_cents: int
    avg_daily_save_cents: float
    projected_days: int | None
    projected_completion_date: date | None

