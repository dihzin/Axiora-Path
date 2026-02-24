from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models import LessonContentType, LessonDifficulty, LessonType, SubjectAgeGroup


class SubjectCreateRequest(BaseModel):
    name: str
    age_group: SubjectAgeGroup = Field(alias="ageGroup")
    icon: str | None = None
    color: str | None = None
    order: int = Field(ge=0)


class SubjectOut(BaseModel):
    id: int
    name: str
    age_group: SubjectAgeGroup = Field(alias="ageGroup")
    icon: str | None = None
    color: str | None = None
    order: int


class UnitCreateRequest(BaseModel):
    subject_id: int = Field(alias="subjectId")
    title: str
    description: str | None = None
    order: int = Field(ge=0)
    required_level: int = Field(default=1, alias="requiredLevel", ge=1)


class UnitOut(BaseModel):
    id: int
    subject_id: int = Field(alias="subjectId")
    title: str
    description: str | None = None
    order: int
    required_level: int = Field(alias="requiredLevel")


class LessonCreateRequest(BaseModel):
    unit_id: int = Field(alias="unitId")
    title: str
    order: int = Field(ge=0)
    xp_reward: int = Field(alias="xpReward", ge=0)
    difficulty: LessonDifficulty = LessonDifficulty.EASY
    type: LessonType


class LessonOut(BaseModel):
    id: int
    unit_id: int = Field(alias="unitId")
    title: str
    order: int
    xp_reward: int = Field(alias="xpReward")
    difficulty: LessonDifficulty
    type: LessonType


class LessonContentCreateRequest(BaseModel):
    content_type: LessonContentType = Field(alias="contentType")
    content_data: dict[str, Any] = Field(alias="contentData")
    order: int = Field(ge=0)


class LessonContentOut(BaseModel):
    id: int
    lesson_id: int = Field(alias="lessonId")
    content_type: LessonContentType = Field(alias="contentType")
    content_data: dict[str, Any] = Field(alias="contentData")
    order: int


class LessonPathItemOut(BaseModel):
    id: int
    title: str
    order: int
    xp_reward: int = Field(alias="xpReward")
    difficulty: LessonDifficulty
    type: LessonType
    unlocked: bool
    completed: bool
    score: int | None = None
    completed_at: datetime | None = Field(default=None, alias="completedAt")


class UnitPathItemOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    order: int
    required_level: int = Field(alias="requiredLevel")
    unlocked: bool
    completion_rate: float = Field(alias="completionRate")
    lessons: list[LessonPathItemOut]


class SubjectPathResponse(BaseModel):
    subject: SubjectOut
    user_level: int = Field(alias="userLevel")
    units: list[UnitPathItemOut]


class LessonCompleteRequest(BaseModel):
    score: int | None = Field(default=None, ge=0, le=100)


class LessonProgressOut(BaseModel):
    id: int
    user_id: int = Field(alias="userId")
    lesson_id: int = Field(alias="lessonId")
    completed: bool
    score: int | None = None
    attempts: int
    repeat_required: bool = Field(alias="repeatRequired")
    variation_seed: str | None = Field(default=None, alias="variationSeed")
    completed_at: datetime | None = Field(default=None, alias="completedAt")


class GamificationSnapshotOut(BaseModel):
    xp: int
    level: int
    daily_xp: int = Field(alias="dailyXp")


class LearningGamificationProfileOut(BaseModel):
    xp: int
    level: int
    daily_xp: int = Field(alias="dailyXp")
    axion_coins: int = Field(alias="axionCoins")
    xp_level_percent: int = Field(alias="xpLevelPercent")
    xp_in_level: int = Field(alias="xpInLevel")
    xp_to_next_level: int = Field(alias="xpToNextLevel")
    max_daily_xp: int = Field(alias="maxDailyXp")


class LessonCompleteResponse(BaseModel):
    lesson_progress: LessonProgressOut = Field(alias="lessonProgress")
    xp_requested: int = Field(alias="xpRequested")
    xp_granted: int = Field(alias="xpGranted")
    coins_requested: int = Field(alias="coinsRequested")
    coins_granted: int = Field(alias="coinsGranted")
    coin_multiplier_applied: float = Field(alias="coinMultiplierApplied")
    unit_boost_activated: bool = Field(alias="unitBoostActivated")
    unit_boost_multiplier: float = Field(alias="unitBoostMultiplier")
    unit_boost_remaining_lessons: int = Field(alias="unitBoostRemainingLessons")
    repeat_required: bool = Field(alias="repeatRequired")
    variation_seed: str | None = Field(default=None, alias="variationSeed")
    unlocked_achievements: list[str] = Field(default_factory=list, alias="unlockedAchievements")
    learning_streak: LearningStreakOut | None = Field(default=None, alias="learningStreak")
    gamification: GamificationSnapshotOut


class LearningEnergyStatusOut(BaseModel):
    energy: int
    max_energy: int = Field(alias="maxEnergy")
    can_play: bool = Field(alias="canPlay")
    seconds_until_playable: int = Field(alias="secondsUntilPlayable")
    seconds_until_next_energy: int = Field(alias="secondsUntilNextEnergy")
    refill_coin_cost: int = Field(alias="refillCoinCost")
    axion_coins: int = Field(alias="axionCoins")


class LearningEnergyConsumeResponse(BaseModel):
    consumed: bool
    status: LearningEnergyStatusOut


class LearningStreakOut(BaseModel):
    current_streak: int = Field(alias="currentStreak")
    longest_streak: int = Field(alias="longestStreak")
    last_lesson_date: datetime | None = Field(default=None, alias="lastLessonDate")
    bonus_coins_granted: int = Field(alias="bonusCoinsGranted")
    unlocked_30_day_badge: bool = Field(alias="unlocked30DayBadge")
