from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models import QuestionType
from app.models import QuestionResult
from app.models import QuestionDifficulty
from app.models import PathEventType, UserPathEventStatus


class LearningNextRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    subject_id: int | None = Field(default=None, alias="subjectId")
    lesson_id: int | None = Field(default=None, alias="lessonId")
    focus_skill_id: str | None = Field(default=None, alias="focusSkillId")
    force_difficulty: QuestionDifficulty | None = Field(default=None, alias="forceDifficulty")
    count: int | None = Field(default=10, ge=1, le=30)


class LearningNextItemOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    question_id: str | None = Field(default=None, alias="questionId")
    template_id: str | None = Field(default=None, alias="templateId")
    generated_variant_id: str | None = Field(default=None, alias="generatedVariantId")
    variant_id: str | None = Field(default=None, alias="variantId")
    type: QuestionType
    prompt: str
    explanation: str | None = None
    skill_id: str = Field(alias="skillId")
    metadata: dict[str, Any]


class LearningFocusSkillOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    skill_id: str = Field(alias="skillId")
    mastery: float
    priority: float


class LearningDifficultyMixOut(BaseModel):
    easy: float
    medium: float
    hard: float


class LearningPlanOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    focus_skills: list[LearningFocusSkillOut] = Field(alias="focusSkills")
    difficulty_mix: LearningDifficultyMixOut = Field(alias="difficultyMix")


class LearningNextResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[LearningNextItemOut]
    plan: LearningPlanOut


class LearningAnswerRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    question_id: str | None = Field(default=None, alias="questionId")
    template_id: str | None = Field(default=None, alias="templateId")
    generated_variant_id: str | None = Field(default=None, alias="generatedVariantId")
    variant_id: str | None = Field(default=None, alias="variantId")
    result: QuestionResult
    time_ms: int = Field(alias="timeMs", ge=0)


class LearningAnswerResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    question_id: str | None = Field(default=None, alias="questionId")
    template_id: str | None = Field(default=None, alias="templateId")
    generated_variant_id: str | None = Field(default=None, alias="generatedVariantId")
    skill_id: str = Field(alias="skillId")
    mastery: float
    mastery_delta: float = Field(alias="masteryDelta")
    streak_correct: int = Field(alias="streakCorrect")
    streak_wrong: int = Field(alias="streakWrong")
    next_review_at: datetime | None = Field(default=None, alias="nextReviewAt")
    retry_recommended: bool = Field(alias="retryRecommended")


class LearningSessionStartRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    subject_id: int | None = Field(default=None, alias="subjectId")
    unit_id: int | None = Field(default=None, alias="unitId")
    lesson_id: int | None = Field(default=None, alias="lessonId")


class LearningSessionStartResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(alias="sessionId")
    subject_id: int = Field(alias="subjectId")
    unit_id: int | None = Field(default=None, alias="unitId")
    lesson_id: int | None = Field(default=None, alias="lessonId")
    started_at: datetime = Field(alias="startedAt")


class LearningSessionFinishRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(alias="sessionId")
    total_questions: int = Field(alias="totalQuestions", ge=0)
    correct_count: int = Field(alias="correctCount", ge=0)


class LearningSessionFinishResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(alias="sessionId")
    ended_at: datetime | None = Field(default=None, alias="endedAt")
    stars: int
    accuracy: float
    total_questions: int = Field(alias="totalQuestions")
    correct_count: int = Field(alias="correctCount")
    xp_earned: int = Field(alias="xpEarned")
    coins_earned: int = Field(alias="coinsEarned")
    leveled_up: bool = Field(alias="leveledUp")
    gamification: dict[str, int]


class LearningInsightSkillOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    skill_id: str = Field(alias="skillId")
    skill_name: str = Field(alias="skillName")
    subject_name: str = Field(alias="subjectName")
    mastery: float


class LearningInsightSubjectOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    subject_id: int = Field(alias="subjectId")
    subject_name: str = Field(alias="subjectName")
    age_group: str = Field(alias="ageGroup")
    mastery_average: float = Field(alias="masteryAverage")
    unit_completion_percent: float = Field(alias="unitCompletionPercent")


class LearningInsightsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    strongest_skills: list[LearningInsightSkillOut] = Field(alias="strongestSkills")
    practice_skills: list[LearningInsightSkillOut] = Field(alias="practiceSkills")
    due_reviews_count: int = Field(alias="dueReviewsCount")
    weekly_xp_earned: int = Field(alias="weeklyXpEarned")
    subjects: list[LearningInsightSubjectOut]


class LearningPathLessonNodeOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    title: str
    order: int
    xp_reward: int = Field(alias="xpReward")
    unlocked: bool
    completed: bool
    score: int | None = None
    stars_earned: int = Field(alias="starsEarned")


class LearningPathEventNodeOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    type: PathEventType
    title: str
    description: str | None = None
    icon_key: str = Field(alias="iconKey")
    rarity: str
    status: UserPathEventStatus
    order_index: int = Field(alias="orderIndex")
    rules: dict[str, Any]
    reward_granted: bool = Field(alias="rewardGranted")


class LearningPathNodeOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    kind: str
    order_index: int = Field(alias="orderIndex")
    lesson: LearningPathLessonNodeOut | None = None
    event: LearningPathEventNodeOut | None = None


class LearningPathUnitOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    title: str
    description: str | None = None
    order: int
    completion_rate: float = Field(alias="completionRate")
    nodes: list[LearningPathNodeOut]


class LearningPathResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    subject_id: int = Field(alias="subjectId")
    subject_name: str = Field(alias="subjectName")
    age_group: str = Field(alias="ageGroup")
    due_reviews_count: int = Field(alias="dueReviewsCount")
    streak_days: int = Field(alias="streakDays")
    mastery_average: float = Field(alias="masteryAverage")
    units: list[LearningPathUnitOut]


class LearningEventStartRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event_id: str = Field(alias="eventId")


class LearningEventStartResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event: LearningPathEventNodeOut
    payload: dict[str, Any]


class LearningEventCompleteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event_id: str = Field(alias="eventId")
    result_summary: dict[str, Any] = Field(default_factory=dict, alias="resultSummary")


class LearningEventCompleteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event: LearningPathEventNodeOut
    status: UserPathEventStatus
    rewards: dict[str, Any]
    passed: bool
    needs_retry: bool = Field(alias="needsRetry")
