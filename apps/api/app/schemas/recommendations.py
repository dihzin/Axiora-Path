from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class RecommendationOut(BaseModel):
    id: int
    child_id: int
    type: str
    title: str
    body: str
    severity: str
    created_at: datetime
    dismissed_at: datetime | None


class DismissRecommendationResponse(BaseModel):
    message: str

