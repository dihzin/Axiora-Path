from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.models import Lesson, Membership, QuestionResult, Tenant, Unit, User
from app.schemas.learning import (
    LearningAnswerRequest,
    LearningAnswerResponse,
    LearningDifficultyMixOut,
    LearningEventCompleteRequest,
    LearningEventCompleteResponse,
    LearningEventStartRequest,
    LearningEventStartResponse,
    LearningFocusSkillOut,
    LearningNextItemOut,
    LearningNextRequest,
    LearningNextResponse,
    LearningPathEventNodeOut,
    LearningPathLessonNodeOut,
    LearningPathNodeOut,
    LearningPathResponse,
    LearningPathUnitOut,
    LearningPlanOut,
    LearningInsightsResponse,
    LearningInsightSkillOut,
    LearningInsightSubjectOut,
    LearningSessionFinishRequest,
    LearningSessionFinishResponse,
    LearningSessionStartRequest,
    LearningSessionStartResponse,
)
from app.services.adaptive_learning import (
    build_next_questions,
    daily_completed_learning_lessons,
    finish_adaptive_learning_session,
    resolve_effective_learning_settings,
    start_learning_session,
    track_question_answer,
)
from app.services.learning_insights import get_learning_insights
from app.services.learning_path_events import build_learning_path, complete_path_event, start_path_event
from app.services.learning_remediation import maybe_enrich_wrong_answer_explanation

router = APIRouter(prefix="/api/learning", tags=["learning"])


@router.get("/path", response_model=LearningPathResponse)
def get_learning_path(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    subject_id: Annotated[int | None, Query(alias="subjectId")] = None,
) -> LearningPathResponse:
    try:
        snapshot = build_learning_path(
            db,
            user_id=user.id,
            subject_id=subject_id,
        )
    except ValueError as exc:
        message = str(exc).strip().lower()
        # Resiliente para subjectId inválido, sem mascarar ausência real de currículo.
        if "subject not found" in message or "no subject available" in message:
            try:
                snapshot = build_learning_path(
                    db,
                    user_id=user.id,
                    subject_id=None,
                )
            except ValueError as fallback_exc:
                fallback_message = str(fallback_exc).strip().lower()
                if "no subject available" in fallback_message:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Trilha de aprendizado ainda não configurada. Execute os seeds de currículo e eventos.",
                    ) from fallback_exc
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(fallback_exc)) from fallback_exc
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Learning path unavailable. Run latest migrations/seeds.",
        ) from exc
    return LearningPathResponse(
        subjectId=snapshot.subject_id,
        subjectName=snapshot.subject_name,
        ageGroup=snapshot.age_group.value,
        dueReviewsCount=snapshot.due_reviews_count,
        streakDays=snapshot.streak_days,
        masteryAverage=snapshot.mastery_average,
        units=[
            LearningPathUnitOut(
                id=unit.id,
                title=unit.title,
                description=unit.description,
                order=unit.order,
                completionRate=unit.completion_rate,
                nodes=[
                    LearningPathNodeOut(
                        kind=node.kind,
                        orderIndex=node.order_index,
                        lesson=(
                            LearningPathLessonNodeOut(
                                id=node.lesson.id,
                                title=node.lesson.title,
                                order=node.lesson.order,
                                xpReward=node.lesson.xp_reward,
                                unlocked=node.lesson.unlocked,
                                completed=node.lesson.completed,
                                score=node.lesson.score,
                                starsEarned=node.lesson.stars_earned,
                            )
                            if node.lesson is not None
                            else None
                        ),
                        event=(
                            LearningPathEventNodeOut(
                                id=node.event.id,
                                type=node.event.type,
                                title=node.event.title,
                                description=node.event.description,
                                iconKey=node.event.icon_key,
                                rarity=node.event.rarity,
                                status=node.event.status,
                                orderIndex=node.event.order_index,
                                rules=node.event.rules,
                                rewardGranted=node.event.reward_granted,
                            )
                            if node.event is not None
                            else None
                        ),
                    )
                    for node in unit.nodes
                ],
            )
            for unit in snapshot.units
        ],
    )


@router.post("/event/start", response_model=LearningEventStartResponse)
def start_learning_event(
    payload: LearningEventStartRequest,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningEventStartResponse:
    try:
        snapshot = start_path_event(db, user_id=user.id, event_id=payload.event_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return LearningEventStartResponse(
        event=LearningPathEventNodeOut(
            id=snapshot.event.id,
            type=snapshot.event.type,
            title=snapshot.event.title,
            description=snapshot.event.description,
            iconKey=snapshot.event.icon_key,
            rarity=snapshot.event.rarity,
            status=snapshot.event.status,
            orderIndex=snapshot.event.order_index,
            rules=snapshot.event.rules,
            rewardGranted=snapshot.event.reward_granted,
        ),
        payload=snapshot.payload,
    )


@router.post("/event/complete", response_model=LearningEventCompleteResponse)
def complete_learning_event(
    payload: LearningEventCompleteRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningEventCompleteResponse:
    try:
        snapshot = complete_path_event(
            db,
            user_id=user.id,
            event_id=payload.event_id,
            result_summary=payload.result_summary,
            tenant_id=tenant.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return LearningEventCompleteResponse(
        event=LearningPathEventNodeOut(
            id=snapshot.event.id,
            type=snapshot.event.type,
            title=snapshot.event.title,
            description=snapshot.event.description,
            iconKey=snapshot.event.icon_key,
            rarity=snapshot.event.rarity,
            status=snapshot.event.status,
            orderIndex=snapshot.event.order_index,
            rules=snapshot.event.rules,
            rewardGranted=snapshot.event.reward_granted,
        ),
        status=snapshot.status,
        rewards=snapshot.rewards,
        passed=snapshot.passed,
        needsRetry=snapshot.needs_retry,
    )


@router.post("/next", response_model=LearningNextResponse)
def get_learning_next_questions(
    payload: LearningNextRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningNextResponse:
    try:
        plan = build_next_questions(
            db,
            user_id=user.id,
            subject_id=payload.subject_id,
            lesson_id=payload.lesson_id,
            focus_skill_id=payload.focus_skill_id,
            force_difficulty=payload.force_difficulty,
            tenant_id=tenant.id,
            count=payload.count or 10,
        )
        # Persist generated variants so /answer can resolve template attempts.
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Adaptive question engine unavailable. Try again in a moment.",
        ) from exc

    return LearningNextResponse(
        items=[
            LearningNextItemOut(
                questionId=item.question_id,
                templateId=item.template_id,
                generatedVariantId=item.generated_variant_id,
                variantId=item.variant_id,
                type=item.type,
                prompt=item.prompt,
                explanation=item.explanation,
                skillId=item.skill_id,
                difficulty=item.difficulty,
                metadata=item.metadata,
            )
            for item in plan.items
        ],
        plan=LearningPlanOut(
            focusSkills=[
                LearningFocusSkillOut(
                    skillId=skill.skill_id,
                    mastery=skill.mastery,
                    priority=skill.priority,
                )
                for skill in plan.focus_skills
            ],
            difficultyMix=LearningDifficultyMixOut(
                easy=plan.difficulty_mix.easy,
                medium=plan.difficulty_mix.medium,
                hard=plan.difficulty_mix.hard,
            ),
        ),
    )


@router.post("/answer", response_model=LearningAnswerResponse)
def submit_learning_answer(
    payload: LearningAnswerRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningAnswerResponse:
    remediation_text: str | None = None
    try:
        result = track_question_answer(
            db,
            user_id=user.id,
            question_id=payload.question_id,
            template_id=payload.template_id,
            generated_variant_id=payload.generated_variant_id,
            variant_id=payload.variant_id,
            result=payload.result,
            time_ms=payload.time_ms,
            tenant_id=tenant.id,
        )
        if payload.result == QuestionResult.WRONG:
            remediation_text = maybe_enrich_wrong_answer_explanation(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                question_id=payload.question_id,
                template_id=payload.template_id,
                generated_variant_id=payload.generated_variant_id,
                variant_id=payload.variant_id,
                wrong_answer=payload.wrong_answer,
            )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    db.commit()
    db.refresh(result.mastery)
    return LearningAnswerResponse(
        questionId=result.question_id,
        templateId=result.template_id,
        generatedVariantId=result.generated_variant_id,
        skillId=result.skill_id,
        mastery=float(result.mastery.mastery),
        masteryDelta=float(result.mastery_delta),
        streakCorrect=result.mastery.streak_correct,
        streakWrong=result.mastery.streak_wrong,
        nextReviewAt=result.mastery.next_review_at,
        retryRecommended=payload.result == QuestionResult.WRONG,
        remediationText=remediation_text,
    )


@router.post("/session/start", response_model=LearningSessionStartResponse)
def start_session(
    payload: LearningSessionStartRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningSessionStartResponse:
    subject_id = payload.subject_id
    unit_id = payload.unit_id
    lesson_id = payload.lesson_id

    if lesson_id is not None:
        lesson = db.get(Lesson, lesson_id)
        if lesson is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        unit = db.get(Unit, lesson.unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
        unit_id = unit.id
        subject_id = unit.subject_id

    if subject_id is None and unit_id is not None:
        subject_id = db.scalar(select(Unit.subject_id).where(Unit.id == unit_id))
    if subject_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="subjectId or lessonId is required")

    effective = resolve_effective_learning_settings(db, tenant_id=tenant.id)
    if lesson_id is not None:
        completed_today = daily_completed_learning_lessons(db, user_id=user.id)
        if completed_today >= effective.max_lessons_per_day:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Daily lesson limit reached for this child.",
            )

    session = start_learning_session(
        db,
        user_id=user.id,
        subject_id=subject_id,
        unit_id=unit_id,
        lesson_id=lesson_id,
        tenant_id=tenant.id,
    )
    db.commit()
    db.refresh(session)
    return LearningSessionStartResponse(
        sessionId=session.id,
        subjectId=session.subject_id,
        unitId=session.unit_id,
        lessonId=session.lesson_id,
        startedAt=session.started_at,
    )


@router.post("/session/finish", response_model=LearningSessionFinishResponse)
def finish_session(
    payload: LearningSessionFinishRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningSessionFinishResponse:
    try:
        result = finish_adaptive_learning_session(
            db,
            user_id=user.id,
            session_id=payload.session_id,
            total_questions=payload.total_questions,
            correct_count=payload.correct_count,
            tenant_id=tenant.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    db.commit()
    return LearningSessionFinishResponse(
        sessionId=result.session.id,
        endedAt=result.session.ended_at,
        stars=result.stars,
        accuracy=result.accuracy,
        totalQuestions=result.session.total_questions,
        correctCount=result.session.correct_count,
        xpEarned=result.xp_earned,
        coinsEarned=result.coins_earned,
        leveledUp=result.leveled_up,
        gamification={
            "xp": result.profile_xp,
            "level": result.profile_level,
            "axionCoins": result.profile_coins,
        },
    )


@router.get("/insights", response_model=LearningInsightsResponse)
def get_learning_insights_endpoint(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningInsightsResponse:
    snapshot = get_learning_insights(db, user_id=user.id)
    return LearningInsightsResponse(
        strongestSkills=[
            LearningInsightSkillOut(
                skillId=item.skill_id,
                skillName=item.skill_name,
                subjectName=item.subject_name,
                mastery=item.mastery,
            )
            for item in snapshot.strongest_skills
        ],
        practiceSkills=[
            LearningInsightSkillOut(
                skillId=item.skill_id,
                skillName=item.skill_name,
                subjectName=item.subject_name,
                mastery=item.mastery,
            )
            for item in snapshot.practice_skills
        ],
        dueReviewsCount=snapshot.due_reviews_count,
        weeklyXpEarned=snapshot.weekly_xp_earned,
        subjects=[
            LearningInsightSubjectOut(
                subjectId=item.subject_id,
                subjectName=item.subject_name,
                ageGroup=item.age_group,
                masteryAverage=item.mastery_average,
                unitCompletionPercent=item.unit_completion_percent,
            )
            for item in snapshot.subjects
        ],
    )
