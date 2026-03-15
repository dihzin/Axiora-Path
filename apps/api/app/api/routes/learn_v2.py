from __future__ import annotations

from dataclasses import asdict
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.core.config import settings
from app.models import ChildProfile, Skill, Subject, Tenant, User, Membership
from app.models_learning import StudentLessonProgress, StudentSkillMastery
from app.services.axion_learning_engine import AxionLearningEngine, NextLessonRecommendation
from app.services.curriculum_loader import CurriculumLoader
from app.services.learning_repository import register_lesson_completion, update_skill_mastery
from app.services.lesson_engine import LessonEngine, StudentSkillState
from app.services.skill_graph import SkillGraph, build_graph


router = APIRouter(prefix="/learn", tags=["learn-v2"])

_XP_BY_DIFFICULTY = {
    "easy": 20,
    "medium": 30,
    "hard": 40,
}


class LearnLessonStartRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    skill: str | None = None
    subject: str | None = None


class LearnLessonCompleteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    subject: str
    skill: str
    lesson: str
    score: int = Field(ge=0, le=100)
    stars: int = Field(default=0, ge=0, le=3)
    time_spent: int = Field(alias="timeSpent", ge=0)
    mastery: float = Field(default=0.0, ge=0.0, le=1.0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    velocity: float = 0.0


class LearnRecommendationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    lesson: str | None
    difficulty: str | None
    xp_reward: int = Field(alias="xpReward")
    next_recommendation: dict[str, Any] | None = Field(alias="nextRecommendation")


class LearnSubjectsResponse(LearnRecommendationResponse):
    subjects: list[str]


class LearnSkillsResponse(LearnRecommendationResponse):
    subject: str
    skills: list[str]
    prerequisite_mastery_threshold: float = Field(alias="prerequisiteMasteryThreshold")
    skill_graph: list[dict[str, Any]] = Field(alias="skillGraph")


def _loader() -> CurriculumLoader:
    return CurriculumLoader()


def _graph() -> SkillGraph:
    return build_graph()


def _age_group_for_user(db: DBSession, *, user_id: int) -> str:
    child = db.scalar(select(ChildProfile).where(ChildProfile.user_id == int(user_id)).limit(1))
    if child is None:
        return "9-12"
    age = _child_age(child.date_of_birth)
    if age <= 8:
        return "6-8"
    if age <= 12:
        return "9-12"
    return "13-15"


def _child_age(date_of_birth: date) -> int:
    today = date.today()
    years = today.year - date_of_birth.year
    if (today.month, today.day) < (date_of_birth.month, date_of_birth.day):
        years -= 1
    return max(0, years)


def _xp_reward(difficulty: str | None) -> int:
    if difficulty is None:
        return 0
    return int(_XP_BY_DIFFICULTY.get(str(difficulty).strip().lower(), 20))


def _serialize_recommendation(recommendation: NextLessonRecommendation | None) -> dict[str, Any] | None:
    if recommendation is None:
        return None
    return asdict(recommendation)


def _stable_lesson_id(value: str) -> int:
    return max(1, sum(ord(char) for char in str(value or "")))


def _response_from_recommendation(
    recommendation: NextLessonRecommendation | None,
) -> dict[str, Any]:
    return {
        "lesson": None if recommendation is None else recommendation.lesson,
        "difficulty": None if recommendation is None else recommendation.difficulty,
        "xpReward": _xp_reward(None if recommendation is None else recommendation.difficulty),
        "nextRecommendation": _serialize_recommendation(recommendation),
    }


def _resolve_subject_row(db: DBSession, *, subject: str) -> Subject | None:
    return db.scalar(select(Subject).where(func.lower(Subject.name) == str(subject).strip().lower()).limit(1))


def _resolve_skill_row(db: DBSession, *, skill: str) -> Skill | None:
    return db.scalar(
        select(Skill).where(
            (Skill.id == str(skill)) | (func.lower(Skill.name) == str(skill).strip().lower())
        ).limit(1)
    )


def _load_skill_mastery_by_name(db: DBSession, *, student_id: int, subject: str) -> dict[str, float]:
    rows = db.execute(
        select(Skill.name, StudentSkillMastery.mastery)
        .select_from(Skill)
        .join(StudentSkillMastery, StudentSkillMastery.skill_id == Skill.id)
        .join(Subject, Subject.id == Skill.subject_id)
        .where(
            StudentSkillMastery.student_id == int(student_id),
            func.lower(Subject.name) == str(subject).strip().lower(),
        )
    ).all()
    return {str(skill_name).strip().lower(): float(mastery) for skill_name, mastery in rows}


def _load_lesson_progress_by_lesson_id(
    db: DBSession,
    *,
    student_id: int,
    lesson_ids: list[int],
) -> dict[int, StudentLessonProgress]:
    if not lesson_ids:
        return {}
    rows = db.scalars(
        select(StudentLessonProgress).where(
            StudentLessonProgress.student_id == int(student_id),
            StudentLessonProgress.lesson_id.in_(lesson_ids),
        )
    ).all()
    return {int(row.lesson_id): row for row in rows}


def _build_skill_graph_payload(
    db: DBSession,
    *,
    user_id: int,
    subject: str,
    graph: SkillGraph,
    loader: CurriculumLoader,
) -> list[dict[str, Any]]:
    threshold = float(settings.axion_prerequisite_mastery_threshold)
    mastery_by_skill = _load_skill_mastery_by_name(db, student_id=user_id, subject=subject)
    lesson_ids = [_stable_lesson_id(lesson) for skill in loader.get_skills(subject) for lesson in loader.get_lessons(skill)]
    progress_by_lesson = _load_lesson_progress_by_lesson_id(db, student_id=user_id, lesson_ids=lesson_ids)
    payload: list[dict[str, Any]] = []

    for skill_name in loader.get_skills(subject):
        node = graph.get_node(skill_name)
        prerequisite_skill = node.prerequisites[0] if node.prerequisites else None
        prerequisite_mastery = 1.0 if prerequisite_skill is None else mastery_by_skill.get(prerequisite_skill, 0.0)
        skill_unlocked = prerequisite_skill is None or prerequisite_mastery >= threshold
        lessons: list[dict[str, Any]] = []

        for index, lesson_name in enumerate(node.lessons):
            lesson_id = _stable_lesson_id(lesson_name)
            progress = progress_by_lesson.get(lesson_id)
            lessons.append(
                {
                    "lessonId": lesson_id,
                    "lesson": lesson_name,
                    "skill": node.id,
                    "difficulty": node.difficulty_progression[min(index, len(node.difficulty_progression) - 1)],
                    "completed": bool(progress.completed) if progress is not None else False,
                    "stars": int(progress.stars) if progress is not None else 0,
                    "unlocked": skill_unlocked,
                }
            )

        payload.append(
            {
                "skill": node.id,
                "mastery": mastery_by_skill.get(node.id, 0.0),
                "prerequisiteSkill": prerequisite_skill,
                "prerequisiteMastery": prerequisite_mastery,
                "prerequisiteThreshold": threshold,
                "lessons": lessons,
            }
        )

    return payload


@router.get("/subjects", response_model=LearnSubjectsResponse)
def get_learn_subjects(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearnSubjectsResponse:
    loader = _loader()
    graph = _graph()
    _ = graph.nodes
    recommendation = AxionLearningEngine(db, graph=graph, tenant_id=tenant.id).recommend_next_lesson(user.id)
    payload = _response_from_recommendation(recommendation)
    return LearnSubjectsResponse(subjects=loader.get_subjects(), **payload)


@router.get("/skills", response_model=LearnSkillsResponse)
def get_learn_skills(
    subject: Annotated[str, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearnSkillsResponse:
    loader = _loader()
    graph = _graph()
    skills = loader.get_skills(subject)
    for skill_name in skills:
        graph.get_node(skill_name)
    skill_graph = _build_skill_graph_payload(
        db,
        user_id=user.id,
        subject=subject,
        graph=graph,
        loader=loader,
    )
    recommendation = AxionLearningEngine(db, graph=graph, tenant_id=tenant.id).recommend_next_lesson(user.id)
    payload = _response_from_recommendation(recommendation)
    return LearnSkillsResponse(
        subject=subject.strip().lower(),
        skills=skills,
        prerequisiteMasteryThreshold=float(settings.axion_prerequisite_mastery_threshold),
        skillGraph=skill_graph,
        **payload,
    )


@router.post("/lesson/start", response_model=LearnRecommendationResponse)
def start_learn_lesson(
    payload: LearnLessonStartRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearnRecommendationResponse:
    loader = _loader()
    graph = _graph()
    axion_engine = AxionLearningEngine(db, graph=graph, tenant_id=tenant.id)
    recommendation = axion_engine.recommend_next_lesson(user.id)
    target_skill = payload.skill or (None if recommendation is None else recommendation.skill)
    if target_skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No lesson recommendation available")

    graph.get_node(target_skill)
    lesson_engine = LessonEngine(db, tenant_id=tenant.id)
    generated = None
    resolved_skill = _resolve_skill_row(db, skill=target_skill)
    if resolved_skill is not None:
        generated = lesson_engine.create_lesson(user.id, str(resolved_skill.id))
    next_recommendation = axion_engine.recommend_next_lesson(user.id)
    response_payload = _response_from_recommendation(next_recommendation)
    if generated is not None:
        response_payload["lesson"] = (
            generated.contents.items[0].prompt
            if generated.contents.items
            else (None if recommendation is None else recommendation.lesson)
        )
        response_payload["difficulty"] = generated.difficulty.value.lower()
        response_payload["xpReward"] = _xp_reward(generated.difficulty.value.lower())
    elif recommendation is not None:
        fallback_difficulty = LessonEngine.__new__(LessonEngine).determine_difficulty(
            StudentSkillState(
                mastery=0.0,
                age_group=_age_group_for_user(db, user_id=user.id),
            )
        ).value.lower()
        response_payload["lesson"] = recommendation.lesson
        response_payload["difficulty"] = fallback_difficulty
        response_payload["xpReward"] = _xp_reward(fallback_difficulty)
    _ = loader.get_subjects()
    return LearnRecommendationResponse(**response_payload)


@router.post("/lesson/complete", response_model=LearnRecommendationResponse)
def complete_learn_lesson(
    payload: LearnLessonCompleteRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearnRecommendationResponse:
    loader = _loader()
    graph = _graph()
    graph.get_node(payload.skill)
    loader.get_skills(payload.subject)

    skill_row = _resolve_skill_row(db, skill=payload.skill)
    subject_row = _resolve_subject_row(db, subject=payload.subject)
    if skill_row is not None:
        update_skill_mastery(
            db,
            student_id=user.id,
            skill_id=str(skill_row.id),
            mastery=payload.mastery,
            confidence=payload.confidence,
            velocity=payload.velocity,
        )
    if subject_row is not None:
        register_lesson_completion(
            db,
            student_id=user.id,
            lesson_id=_stable_lesson_id(payload.lesson),
            subject_id=int(subject_row.id),
            completed=payload.score >= 60,
            score=payload.score,
            stars=payload.stars,
            time_spent=payload.time_spent,
            current_skill=None if skill_row is None else str(skill_row.id),
        )
    db.commit()

    recommendation = AxionLearningEngine(db, graph=graph, tenant_id=tenant.id).recommend_next_lesson(user.id)
    response_payload = _response_from_recommendation(recommendation)
    if response_payload["lesson"] is None:
        response_payload["lesson"] = payload.lesson
    if response_payload["difficulty"] is None:
        response_payload["difficulty"] = LessonEngine.__new__(LessonEngine).determine_difficulty(
            StudentSkillState(
                mastery=payload.mastery,
                age_group=_age_group_for_user(db, user_id=user.id),
            )
        ).value.lower()
        response_payload["xpReward"] = _xp_reward(response_payload["difficulty"])
    return LearnRecommendationResponse(**response_payload)


@router.get("/next", response_model=LearnRecommendationResponse)
def get_learn_next(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearnRecommendationResponse:
    recommendation = AxionLearningEngine(db, graph=_graph(), tenant_id=tenant.id).recommend_next_lesson(user.id)
    return LearnRecommendationResponse(**_response_from_recommendation(recommendation))
