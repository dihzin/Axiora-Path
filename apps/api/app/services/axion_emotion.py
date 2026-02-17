from __future__ import annotations

from dataclasses import dataclass

from app.models import MoodType


@dataclass(frozen=True)
class AxionEmotionInput:
    streak: int
    weekly_completion_rate: float
    last_mood: MoodType | None
    goal_progress_percent: float
    inactivity_days: int


class AxionEmotionService:
    def resolve(self, payload: AxionEmotionInput) -> str:
        if payload.weekly_completion_rate >= 80:
            return "CELEBRATING"
        if payload.streak >= 7:
            return "PROUD"
        if payload.inactivity_days >= 2:
            return "CONCERNED"
        if payload.goal_progress_percent >= 80:
            return "EXCITED"
        if payload.last_mood in {MoodType.SAD, MoodType.ANGRY, MoodType.TIRED}:
            return "CONCERNED"
        return "NEUTRAL"
