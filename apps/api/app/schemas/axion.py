from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel
from pydantic import ConfigDict, Field


class AxionStateResponse(BaseModel):
    stage: int
    mood_state: str
    personality_traits: list[str]


class BehaviorMetricInputs(BaseModel):
    xpLast7Days: int
    xpPrevious7Days: int
    activeDays7: int
    errorRateLast20: float
    streak: int
    inactivityDays: int
    rapidRetryRatio: float
    sessionAbortRatio: float
    masteryDeltaProxy: float


class UserBehaviorMetricsResponse(BaseModel):
    userId: int
    rhythmScore: float
    frustrationScore: float
    confidenceScore: float
    dropoutRisk: float
    learningMomentum: float
    updatedAt: datetime


class UserBehaviorMetricsComputeResponse(UserBehaviorMetricsResponse):
    inputs: BehaviorMetricInputs


class AxionMessageRequest(BaseModel):
    context: str


class AxionMessageResponse(BaseModel):
    templateId: int
    tone: str
    message: str


class AxionBriefCTA(BaseModel):
    label: str
    actionType: str
    payload: dict[str, Any] = Field(default_factory=dict)


class AxionBriefMiniStats(BaseModel):
    streak: int
    dueReviews: int
    energy: int


class AxionBriefStateSummary(BaseModel):
    trend: str


class AxionBriefDebug(BaseModel):
    state: dict[str, Any]
    triggeredRules: list[int] = Field(default_factory=list)
    evaluatedRules: list[dict[str, Any]] = Field(default_factory=list)
    decisions: list[dict[str, Any]] = Field(default_factory=list)
    factsUsed: dict[str, Any] = Field(default_factory=dict)
    temporaryBoosts: list[dict[str, Any]] = Field(default_factory=list)
    templateChosen: int | None = None


class AxionBriefResponse(BaseModel):
    stateSummary: AxionBriefStateSummary
    message: str
    tone: str
    cta: AxionBriefCTA
    miniStats: AxionBriefMiniStats
    debug: AxionBriefDebug | None = None


class ParentInsightCard(BaseModel):
    title: str
    summary: str
    tone: str


class ParentInsightSkill(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    skill_name: str = Field(alias="skillName")
    subject_name: str = Field(alias="subjectName")
    explanation: str


class ParentAxionInsightsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    learning_rhythm: ParentInsightCard = Field(alias="learningRhythm")
    emotional_trend: ParentInsightCard = Field(alias="emotionalTrend")
    strength_skills: list[ParentInsightSkill] = Field(alias="strengthSkills")
    reinforcement_skills: list[ParentInsightSkill] = Field(alias="reinforcementSkills")
    dropout_risk: ParentInsightCard = Field(alias="dropoutRisk")
    suggested_parental_actions: list[str] = Field(alias="suggestedParentalActions")
