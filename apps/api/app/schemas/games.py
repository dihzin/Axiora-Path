from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

GameTypeLiteral = Literal[
    "TICTACTOE",
    "WORDSEARCH",
    "MEMORY",
    "CROSSWORD",
    "HANGMAN",
    "FINANCE_SIM",
    "TUG_OF_WAR",
    "QUIZ_BATTLE",
    "MATH_CHALLENGE",
    "PUZZLE_COOP",
    "FINANCE_BATTLE",
]

PersonalBestTypeLiteral = Literal["score", "streak", "speed"]
GameMissionScopeLiteral = Literal["daily", "weekly"]
GameMissionMetricLiteral = Literal["sessions", "xp", "records"]


class GameSessionCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    game_type: GameTypeLiteral = Field(alias="gameType")
    child_id: int | None = Field(default=None, alias="childId", ge=1)
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


class GameResultPayload(BaseModel):
    """Canonical game completion contract.

    Games can send partial payloads. Non-applicable metrics should be null.
    """

    model_config = ConfigDict(populate_by_name=True)

    game_id: str = Field(alias="gameId", min_length=1, max_length=64)
    session_id: str | None = Field(default=None, alias="sessionId")
    score: int = Field(default=0, ge=0)
    accuracy: float | None = Field(default=None, ge=0, le=1)
    correct_answers: int | None = Field(default=None, alias="correctAnswers", ge=0)
    wrong_answers: int | None = Field(default=None, alias="wrongAnswers", ge=0)
    streak: int | None = Field(default=None, ge=0)
    max_streak: int | None = Field(default=None, alias="maxStreak", ge=0)
    duration_seconds: int | None = Field(default=None, alias="durationSeconds", ge=0)
    level_reached: int | None = Field(default=None, alias="levelReached", ge=0)
    completed: bool = True
    xp_delta: int | None = Field(default=None, alias="xpDelta", ge=0)
    coins_delta: int | None = Field(default=None, alias="coinsDelta", ge=0)
    personal_best_type: PersonalBestTypeLiteral | None = Field(default=None, alias="personalBestType")
    metadata: dict[str, Any] = Field(default_factory=dict)


class GameSessionCompleteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    child_id: int | None = Field(default=None, alias="childId", ge=1)
    result: GameResultPayload


class GamePersonalBestOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    child_id: int = Field(alias="childId")
    game_id: str = Field(alias="gameId")
    best_score: int | None = Field(default=None, alias="bestScore")
    best_streak: int | None = Field(default=None, alias="bestStreak")
    best_duration_seconds: int | None = Field(default=None, alias="bestDurationSeconds")
    last_surpassed_at: datetime | None = Field(default=None, alias="lastSurpassedAt")
    best_result_payload: dict[str, Any] = Field(default_factory=dict, alias="bestResultPayload")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class GameSessionCompleteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    profile: UserGameProfileOut
    session: GameSessionOut
    daily_limit: DailyXpLimitOut = Field(alias="dailyLimit")
    unlocked_achievements: list[str] = Field(default_factory=list, alias="unlockedAchievements")
    is_personal_best: bool = Field(alias="isPersonalBest")
    personal_best_type: PersonalBestTypeLiteral | None = Field(default=None, alias="personalBestType")
    personal_best: GamePersonalBestOut | None = Field(default=None, alias="personalBest")


class GameMetagameStreakOut(BaseModel):
    current: int
    best: int


class GameMetagameStatsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_sessions: int = Field(alias="totalSessions")
    weekly_sessions: int = Field(alias="weeklySessions")
    daily_sessions: int = Field(alias="dailySessions")
    xp_today: int = Field(alias="xpToday")
    xp_week: int = Field(alias="xpWeek")
    records_total: int = Field(alias="recordsTotal")
    records_today: int = Field(alias="recordsToday")
    records_week: int = Field(alias="recordsWeek")
    favorite_game_id: str | None = Field(default=None, alias="favoriteGameId")
    distinct_games_played: int = Field(alias="distinctGamesPlayed")


class GameMetagameMissionOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    scope: GameMissionScopeLiteral
    title: str
    description: str
    metric: GameMissionMetricLiteral
    target: int
    current: int
    progress_percent: float = Field(alias="progressPercent")
    reward_xp: int = Field(alias="rewardXp")
    reward_coins: int = Field(alias="rewardCoins")
    period_start: date = Field(alias="periodStart")
    period_end: date = Field(alias="periodEnd")
    claimed: bool
    reward_ready: bool = Field(alias="rewardReady")
    cta_label: str = Field(alias="ctaLabel")


class GameMetagameBadgeOut(BaseModel):
    id: str
    title: str
    description: str
    unlocked: bool
    progress: int
    target: int


class GameMetagameSummaryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    generated_at: datetime = Field(alias="generatedAt")
    streak: GameMetagameStreakOut
    stats: GameMetagameStatsOut
    daily_mission: GameMetagameMissionOut = Field(alias="dailyMission")
    weekly_mission: GameMetagameMissionOut = Field(alias="weeklyMission")
    badges: list[GameMetagameBadgeOut]
    motivation_message: str = Field(alias="motivationMessage")


class GameMetagameClaimRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    child_id: int | None = Field(default=None, alias="childId", ge=1)
    mission_scope: GameMissionScopeLiteral = Field(alias="missionScope")
    mission_id: str = Field(alias="missionId", min_length=1, max_length=64)


class GameMetagameClaimResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    mission_scope: GameMissionScopeLiteral = Field(alias="missionScope")
    mission_id: str = Field(alias="missionId")
    completed: bool
    reward_granted: bool = Field(alias="rewardGranted")
    already_claimed: bool = Field(alias="alreadyClaimed")
    xp_reward: int = Field(alias="xpReward")
    coin_reward: int = Field(alias="coinReward")
