from __future__ import annotations

from pydantic import BaseModel


class WeeklyTrendResponse(BaseModel):
    completion_delta_percent: float
    earnings_delta_percent: float

