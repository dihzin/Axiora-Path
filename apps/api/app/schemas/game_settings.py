from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GameSettingsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    child_id: int = Field(alias="childId")
    max_daily_xp: int = Field(alias="maxDailyXp")
    max_daily_learning_xp: int = Field(alias="maxDailyLearningXp")
    max_weekly_coin_conversion: int = Field(alias="maxWeeklyCoinConversion")
    learning_coin_reward_multiplier: float = Field(alias="learningCoinRewardMultiplier")
    enabled_games: dict[str, bool] = Field(alias="enabledGames")
    require_approval_after_minutes: int = Field(alias="requireApprovalAfterMinutes")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class GameSettingsUpsertRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    child_id: int = Field(alias="childId")
    max_daily_xp: int = Field(alias="maxDailyXp", ge=0)
    max_daily_learning_xp: int = Field(default=200, alias="maxDailyLearningXp", ge=0)
    max_weekly_coin_conversion: int = Field(alias="maxWeeklyCoinConversion", ge=0)
    learning_coin_reward_multiplier: float = Field(default=1.0, alias="learningCoinRewardMultiplier", ge=0)
    enabled_games: dict[str, bool] = Field(alias="enabledGames")
    require_approval_after_minutes: int = Field(alias="requireApprovalAfterMinutes", ge=0)
