from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AchievementItemOut(BaseModel):
    id: int
    slug: str
    title: str
    description: str
    icon_key: str
    unlocked: bool
    unlocked_at: datetime | None


class AchievementListResponse(BaseModel):
    child_id: int
    achievements: list[AchievementItemOut]
