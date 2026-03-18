from __future__ import annotations

from datetime import UTC, date, datetime
import logging
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query
from fastapi import HTTPException, status
from sqlalchemy import exists, or_, select
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import AxionDecision, Lesson, Membership, Question, QuestionResult, QuestionTemplate, QuestionType, Skill, Subject, Tenant, Unit, User
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
    daily_completed_learning_lessons,
    finish_adaptive_learning_session,
    resolve_effective_learning_settings,
    start_learning_session,
    track_question_answer,
)
from app.services.aprender import (
    LessonLockedError,
    LessonNotFoundError,
    complete_lesson as _complete_lesson_progress,
)
from app.services.child_context import resolve_child_context
from app.services.learning_insights import get_learning_insights
from app.services.lesson_engine import LessonEngine
from app.services.learning_path_events import build_learning_path, complete_path_event, start_path_event
from app.services.learning_remediation import maybe_enrich_wrong_answer_explanation
from app.services.age_policy import (
    enforce_subject_age_gate,
    remap_subject_for_child_age,
    resolve_child_age_by_child_id,
)
from app.services.axion_subject_mastery import record_content_outcome
# get_child_age is now accessed via age_policy module (removed from direct import)

router = APIRouter(prefix="/api/learning", tags=["learning"])
logger = logging.getLogger("axiora.api.learning")


def _resolve_subject_name_for_skill(db: DBSession, *, skill_id: str) -> str | None:
    row = db.scalar(
        select(Subject.name)
        .select_from(Skill)
        .join(Subject, Subject.id == Skill.subject_id)
        .where(Skill.id == str(skill_id))
        .limit(1)
    )
    if row is None:
        return None
    return str(row).strip().lower() or None


def _to_mastery_outcome(result: QuestionResult) -> str:
    if result == QuestionResult.CORRECT:
        return "correct"
    if result == QuestionResult.WRONG:
        return "incorrect"
    return "skipped"


def _normalize_learning_correlation_id(raw_value: str | None) -> str:
    token = str(raw_value or "").strip()
    if not token:
        return str(uuid4())
    try:
        return str(UUID(token))
    except Exception:
        return token


def _apply_subject_mastery_once_per_decision(
    db: DBSession,
    *,
    tenant_id: int,
    user_id: int,
    child_id: int,
    subject: str,
    outcome: str,
    correlation_id: str,
) -> float | None:
    decision = db.scalar(
        select(AxionDecision).where(
            AxionDecision.tenant_id == int(tenant_id),
            AxionDecision.user_id == int(user_id),
            AxionDecision.correlation_id == correlation_id,
        )
    )
    if decision is not None and bool(getattr(decision, "mastery_applied", False)):
        return None
    score = record_content_outcome(
        db,
        tenant_id=int(tenant_id),
        child_id=int(child_id),
        subject=subject,
        outcome=outcome,
        correlation_id=correlation_id,
    )
    if decision is not None:
        decision.mastery_applied = True
    return score


def _subject_has_playable_content(db: DBSession, *, subject_id: int) -> bool:
    row = db.scalar(
        select(Skill.id)
        .where(Skill.subject_id == int(subject_id))
        .where(
            or_(
                exists(select(1).where(QuestionTemplate.skill_id == Skill.id)),
                exists(
                    select(1).where(
                        Question.skill_id == Skill.id,
                        Question.type != QuestionType.TEMPLATE,
                    )
                ),
            )
        )
        .limit(1)
    )
    return row is not None


def _has_playable_content_for_child_age(db: DBSession, *, child_age: int) -> bool:
    subject_ids = db.scalars(
        select(Subject.id).where(
            Subject.age_min <= int(child_age),
            Subject.age_max >= int(child_age),
        )
    ).all()
    return any(_subject_has_playable_content(db, subject_id=int(subject_id)) for subject_id in subject_ids)


def _learning_unavailable_detail_for_child_age(child_age: int | None) -> str:
    if child_age is None:
        return "Trilha de aprendizado ainda não configurada. Execute os seeds de currículo e eventos."
    if child_age < 6:
        return "Ainda não há missões disponíveis para esta criança. O currículo atual começa aos 6 anos."
    return "Ainda não há missões disponíveis para a idade desta criança."


# NOTE: _remap_subject_id_for_child_age and _ensure_subject_allowed_for_child_age
# were removed in Wave 1 refactor (2026-03-16).
# Canonical implementations now live in app.services.age_policy:
#   - remap_subject_for_child_age(...)
#   - enforce_subject_age_gate(...)


@router.get("/path", response_model=LearningPathResponse)
def get_learning_path(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    subject_id: Annotated[int | None, Query(alias="subjectId")] = None,
    child_id: Annotated[int | None, Query(alias="childId")] = None,
) -> LearningPathResponse:
    active_child = resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=child_id,
    )
    active_child_age = resolve_child_age_by_child_id(db, child_id=active_child.id)
    effective_subject_id = subject_id
    if effective_subject_id is not None:
        effective_subject_id = remap_subject_for_child_age(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            requested_subject_id=int(effective_subject_id),
            child_id=active_child.id,
        )
    if effective_subject_id is not None and not _subject_has_playable_content(db, subject_id=effective_subject_id):
        effective_subject_id = None
    try:
        snapshot = build_learning_path(
            db,
            user_id=user.id,
            subject_id=effective_subject_id,
            child_age=active_child_age,
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
                    child_age=active_child_age,
                )
            except ValueError as fallback_exc:
                fallback_message = str(fallback_exc).strip().lower()
                if "no subject available" in fallback_message:
                    if active_child_age is not None and not _has_playable_content_for_child_age(db, child_age=active_child_age):
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail=_learning_unavailable_detail_for_child_age(active_child_age),
                        ) from fallback_exc
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
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningNextResponse:
    active_child = resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=payload.child_id,
    )
    effective_subject_id = payload.subject_id
    if effective_subject_id is None and payload.lesson_id is not None:
        lesson = db.get(Lesson, payload.lesson_id)
        if lesson is not None:
            unit = db.get(Unit, lesson.unit_id)
            if unit is not None:
                effective_subject_id = unit.subject_id
    if effective_subject_id is not None:
        enforce_subject_age_gate(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            subject_id=int(effective_subject_id),
            child_id=active_child.id,
        )

    try:
        plan = LessonEngine(db, tenant_id=tenant.id).generate_lesson_contents(
            student_id=user.id,
            subject_id=payload.subject_id,
            lesson_id=payload.lesson_id,
            focus_skill_id=payload.focus_skill_id,
            force_difficulty=payload.force_difficulty,
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
    except Exception as exc:
        db.rollback()
        logger.exception(
            "learning_next_unhandled_error",
            extra={
                "user_id": user.id,
                "tenant_id": tenant.id,
                "subject_id": payload.subject_id,
                "lesson_id": payload.lesson_id,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Adaptive question engine unavailable. Try again in a moment.",
        ) from exc
    if len(plan.items) <= 0:
        diagnostics = dict(plan.diagnostics or {})
        logger.info(
            "learning_next_empty_batch",
            extra={
                "user_id": user.id,
                "tenant_id": tenant.id,
                "subject_id": payload.subject_id,
                "lesson_id": payload.lesson_id,
                "candidates_raw": diagnostics.get("candidates_raw"),
                "candidates_filtered": diagnostics.get("candidates_filtered"),
                "fallback_reason": diagnostics.get("fallback_reason"),
                "block_reason": diagnostics.get("block_reason"),
            },
        )

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
            diagnostics=(dict(plan.diagnostics) if plan.diagnostics else None),
        ),
    )


@router.post("/answer", response_model=LearningAnswerResponse)
def submit_learning_answer(
    payload: LearningAnswerRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningAnswerResponse:
    remediation_text: str | None = None
    correlation_id = _normalize_learning_correlation_id(payload.correlation_id)
    active_child = resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=payload.child_id,
    )
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
        subject_name = _resolve_subject_name_for_skill(db, skill_id=result.skill_id)
        if subject_name:
            _apply_subject_mastery_once_per_decision(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                child_id=int(active_child.id),
                subject=subject_name,
                outcome=_to_mastery_outcome(payload.result),
                correlation_id=correlation_id,
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
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningSessionStartResponse:
    active_child = resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=payload.child_id,
    )
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
    enforce_subject_age_gate(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        subject_id=int(subject_id),
        child_id=active_child.id,
    )

    effective = resolve_effective_learning_settings(db, tenant_id=tenant.id, child_id=active_child.id)
    if lesson_id is not None:
        completed_today = daily_completed_learning_lessons(db, user_id=user.id)
        if completed_today >= effective.max_lessons_per_day:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Daily lesson limit reached for this child.",
            )

    try:
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
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Learning session unavailable. Try again in a moment.",
        ) from exc
    except Exception as exc:
        db.rollback()
        logger.exception(
            "learning_session_start_unhandled_error",
            extra={
                "user_id": user.id,
                "tenant_id": tenant.id,
                "subject_id": subject_id,
                "unit_id": unit_id,
                "lesson_id": lesson_id,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Learning session unavailable. Try again in a moment.",
        ) from exc

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
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningSessionFinishResponse:
    active_child = resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=payload.child_id,
    )
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

    # ── Canonical lesson progress update (Wave 2 — eliminates dual completion write) ──
    # If this session was tied to a specific lesson, mark LessonProgress without
    # granting economy rewards (adaptive session already handled XP/coins above).
    # Errors here are non-fatal: progress update is best-effort; session result stands.
    if result.session.lesson_id is not None:
        accuracy = (
            payload.correct_count / payload.total_questions
            if payload.total_questions and payload.total_questions > 0
            else 0.0
        )
        score = max(0, min(100, round(accuracy * 100)))
        try:
            _complete_lesson_progress(
                db,
                user_id=user.id,
                lesson_id=int(result.session.lesson_id),
                score=score,
                tenant_id=tenant.id,
                grant_economy_rewards=False,  # rewards already granted by adaptive session
            )
            logger.info(
                "learning_session_lesson_progress_updated",
                extra={
                    "user_id": user.id,
                    "session_id": payload.session_id,
                    "lesson_id": result.session.lesson_id,
                    "score": score,
                },
            )
        except (LessonNotFoundError, LessonLockedError) as exc:
            logger.warning(
                "learning_session_lesson_progress_skipped",
                extra={
                    "user_id": user.id,
                    "session_id": payload.session_id,
                    "lesson_id": result.session.lesson_id,
                    "reason": str(exc),
                },
            )
        except Exception as exc:
            logger.error(
                "learning_session_lesson_progress_error",
                extra={
                    "user_id": user.id,
                    "session_id": payload.session_id,
                    "lesson_id": result.session.lesson_id,
                    "error": str(exc),
                },
            )

    if payload.decision_id:
        decision = db.scalar(
            select(AxionDecision).where(
                AxionDecision.id == payload.decision_id,
                AxionDecision.user_id == user.id,
            )
        )
        if decision is not None and decision.tenant_id is not None and int(decision.tenant_id) == int(tenant.id):
            child_id = int(decision.child_id) if decision.child_id is not None else None
            if child_id is None:
                child_id = int(active_child.id)
            completed_at = datetime.now(UTC)
            events.emit(
                type="axion_session_completed",
                tenant_id=tenant.id,
                actor_user_id=user.id,
                child_id=child_id,
                payload={
                    "decision_id": payload.decision_id,
                    "child_id": child_id,
                    "tenant_id": tenant.id,
                    "timestamp": completed_at.isoformat(),
                    "session_completed_at": completed_at.isoformat(),
                    "destination": "learning",
                    "session_id": result.session.id,
                },
            )

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
