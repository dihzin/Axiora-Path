from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models import WeeklyMissionType


class MissionProgressOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    mission_id: str = Field(alias="missionId")
    title: str
    description: str | None = None
    mission_type: WeeklyMissionType = Field(alias="missionType")
    target_value: int = Field(alias="targetValue")
    current_value: int = Field(alias="currentValue")
    completed: bool
    completed_at: datetime | None = Field(default=None, alias="completedAt")
    reward_granted: bool = Field(alias="rewardGranted")
    xp_reward: int = Field(alias="xpReward")
    coin_reward: int = Field(alias="coinReward")
    is_seasonal: bool = Field(alias="isSeasonal")
    theme_key: str | None = Field(default=None, alias="themeKey")
    start_date: date = Field(alias="startDate")
    end_date: date = Field(alias="endDate")
    progress_percent: float = Field(alias="progressPercent")


class MissionsCurrentResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    missions: list[MissionProgressOut]
    current_streak: int = Field(alias="currentStreak")
    longest_streak: int = Field(alias="longestStreak")
    almost_there: bool = Field(alias="almostThere")
    show_nudge: bool = Field(alias="showNudge")
    nudge_message: str = Field(alias="nudgeMessage")
    upcoming_seasonal_event: dict[str, Any] | None = Field(default=None, alias="upcomingSeasonalEvent")


class MissionClaimRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    mission_id: str = Field(alias="missionId")


class MissionClaimResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    mission_id: str = Field(alias="missionId")
    completed: bool
    reward_granted: bool = Field(alias="rewardGranted")
    xp_reward: int = Field(alias="xpReward")
    coin_reward: int = Field(alias="coinReward")


class SeasonEventOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    theme_key: str = Field(alias="themeKey")
    start_date: date = Field(alias="startDate")
    end_date: date = Field(alias="endDate")
    description: str | None = None
    background_style: dict[str, Any] = Field(alias="backgroundStyle")
    bonus_xp_multiplier: float = Field(alias="bonusXpMultiplier")
    bonus_coin_multiplier: float = Field(alias="bonusCoinMultiplier")


class ActiveSeasonEventsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    active: list[SeasonEventOut]
    upcoming: SeasonEventOut | None = None
    countdown_days: int | None = Field(default=None, alias="countdownDays")


class CalendarActivityDayOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    date: date
    lessons_completed: int = Field(alias="lessonsCompleted")
    xp_earned: int = Field(alias="xpEarned")
    missions_completed: int = Field(alias="missionsCompleted")
    streak_maintained: bool = Field(alias="streakMaintained")
    perfect_sessions: int = Field(alias="perfectSessions")


class CalendarActivityResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    month: int
    year: int
    current_streak: int = Field(alias="currentStreak")
    longest_streak: int = Field(alias="longestStreak")
    days: list[CalendarActivityDayOut]
