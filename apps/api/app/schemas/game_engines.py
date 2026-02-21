from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

DifficultyLiteral = Literal["EASY", "MEDIUM", "HARD"]


class GameCatalogItemOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    template_id: str = Field(alias="templateId")
    title: str
    subject: str
    age_group: str = Field(alias="ageGroup")
    engine_key: str = Field(alias="engineKey")
    difficulty: DifficultyLiteral
    estimated_minutes: int = Field(alias="estimatedMinutes", ge=1)
    xp_reward: int = Field(alias="xpReward", ge=0)
    coins_reward: int = Field(alias="coinsReward", ge=0)
    tags: list[str] = Field(default_factory=list)


class GamesCatalogResponse(BaseModel):
    items: list[GameCatalogItemOut]


class StartGameSessionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    template_id: str = Field(alias="templateId")
    variation_id: str | None = Field(default=None, alias="variationId")
    level_id: str | None = Field(default=None, alias="levelId")
    context: dict[str, Any] = Field(default_factory=dict)


class StartGameSessionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(alias="sessionId")
    game: dict[str, Any]
    axion: dict[str, Any] | None = None


class GameAnswerRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    step_id: str = Field(alias="stepId")
    answer: dict[str, Any]
    elapsed_ms: int = Field(alias="elapsedMs", ge=0)
    hints_used: int = Field(alias="hintsUsed", ge=0, default=0)


class GameAnswerResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    correct: bool
    score_delta: int = Field(alias="scoreDelta")
    feedback: str
    cognitive_signals: list[dict[str, Any]] = Field(default_factory=list, alias="cognitiveSignals")
    next_step: dict[str, Any] | None = Field(default=None, alias="nextStep")


class FinishGameSessionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(alias="sessionId")
    total_score: int = Field(alias="totalScore", ge=0)
    accuracy: float = Field(ge=0, le=1)
    time_spent_ms: int = Field(alias="timeSpentMs", ge=0)
    xp_earned: int = Field(alias="xpEarned", ge=0)
    coins_earned: int = Field(alias="coinsEarned", ge=0)
    updated_skills: list[dict[str, Any]] = Field(default_factory=list, alias="updatedSkills")

