from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class TaskCreateRequest(BaseModel):
    title: str
    description: str | None = None
    difficulty: Literal["EASY", "MEDIUM", "HARD", "LEGENDARY"]
    weight: int


class TaskUpdateRequest(BaseModel):
    title: str
    description: str | None = None
    difficulty: Literal["EASY", "MEDIUM", "HARD", "LEGENDARY"]
    weight: int
    is_active: bool


class TaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    difficulty: str
    weight: int
    is_active: bool


class RoutineMarkRequest(BaseModel):
    child_id: int
    task_id: int
    date: date


class RoutineDecideRequest(BaseModel):
    log_id: int
    decision: Literal["APPROVE", "REJECT"]
    parent_comment: str | None = None


class TaskLogOut(BaseModel):
    id: int
    child_id: int
    task_id: int
    task_title: str
    task_weight: int
    date: date
    status: str
    created_at: datetime
    decided_at: datetime | None
    decided_by_user_id: int | None
    parent_comment: str | None
    xp_awarded: int
    xp_source: str | None


class TaskWeeklyProgressOut(BaseModel):
    task_id: int
    task_title: str
    task_weight: int
    xp_per_approval: int
    marked_count_week: int
    approved_count_week: int
    pending_count_week: int
    rejected_count_week: int
    completion_percent_week: float
    completed_today: bool
    xp_gained_week: int


class RoutineWeekResponse(BaseModel):
    start_date: date
    end_date: date
    logs: list[TaskLogOut]
    task_progress: list[TaskWeeklyProgressOut]


class StreakResponse(BaseModel):
    child_id: int
    current: int
    freeze_tokens: int
    freeze_used_today: bool
    last_date: date | None


class WeeklyMetricsResponse(BaseModel):
    completion_rate: float
    approved_count: int
    pending_count: int
    rejected_count: int
