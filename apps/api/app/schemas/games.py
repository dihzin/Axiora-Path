from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

GameTypeLiteral = Literal["TICTACTOE", "WORDSEARCH", "CROSSWORD", "HANGMAN", "FINANCE_SIM"]


class GameSessionCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    game_type: GameTypeLiteral = Field(alias="gameType")
    score: int = Field(ge=0)


class UserGameProfileOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: int = Field(alias="userId")
    xp: int
    level: int
    axion_coins: int = Field(alias="axionCoins")
    daily_xp: int = Field(alias="dailyXp")
    last_xp_reset: date = Field(alias="lastXpReset")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class GameSessionOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: int = Field(alias="userId")
    game_type: GameTypeLiteral = Field(alias="gameType")
    score: int
    xp_earned: int = Field(alias="xpEarned")
    coins_earned: int = Field(alias="coinsEarned")
    created_at: datetime = Field(alias="createdAt")


class DailyXpLimitOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    max_xp_per_day: int = Field(alias="maxXpPerDay")
    granted_xp: int = Field(alias="grantedXp")
    requested_xp: int = Field(alias="requestedXp")
    remaining_xp_today: int = Field(alias="remainingXpToday")


class GameSessionRegisterResponse(BaseModel):
    profile: UserGameProfileOut
    session: GameSessionOut
    daily_limit: DailyXpLimitOut = Field(alias="dailyLimit")
    unlocked_achievements: list[str] = Field(default_factory=list, alias="unlockedAchievements")
