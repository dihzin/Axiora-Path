from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.models import DailyMissionRarity, DailyMissionStatus


class DailyMissionResponse(BaseModel):
    id: str
    date: date
    title: str
    description: str
    rarity: DailyMissionRarity
    xp_reward: int
    coin_reward: int
    status: DailyMissionStatus


class DailyMissionCompleteResponse(BaseModel):
    success: bool
    xp_gained: int
    coins_gained: int
    new_level: int
    streak: int


class DailyMissionHistoryItem(BaseModel):
    date: date
    rarity: DailyMissionRarity
    status: DailyMissionStatus
    xp_reward: int
