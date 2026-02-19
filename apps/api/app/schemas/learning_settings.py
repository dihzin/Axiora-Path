from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import QuestionDifficulty


class LearningSettingsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    child_id: int = Field(alias="childId")
    max_daily_learning_xp: int = Field(alias="maxDailyLearningXP")
    max_lessons_per_day: int = Field(alias="maxLessonsPerDay")
    difficulty_ceiling: QuestionDifficulty = Field(alias="difficultyCeiling")
    enable_spaced_repetition: bool = Field(alias="enableSpacedRepetition")
    enable_coins_rewards: bool = Field(alias="enableCoinsRewards")
    xp_multiplier: float = Field(alias="xpMultiplier")
    coins_enabled: bool = Field(alias="coinsEnabled")
    enabled_subjects: dict[str, bool] = Field(alias="enabledSubjects")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class LearningSettingsUpsertRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    child_id: int = Field(alias="childId")
    max_daily_learning_xp: int = Field(default=200, alias="maxDailyLearningXP", ge=0)
    max_lessons_per_day: int = Field(alias="maxLessonsPerDay", ge=0)
    difficulty_ceiling: QuestionDifficulty = Field(default=QuestionDifficulty.HARD, alias="difficultyCeiling")
    enable_spaced_repetition: bool = Field(default=True, alias="enableSpacedRepetition")
    enable_coins_rewards: bool = Field(default=True, alias="enableCoinsRewards")
    xp_multiplier: float = Field(alias="xpMultiplier", ge=0)
    coins_enabled: bool = Field(default=True, alias="coinsEnabled")
    enabled_subjects: dict[str, bool] = Field(alias="enabledSubjects")
