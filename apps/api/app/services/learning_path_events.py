from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    LearningSession,
    Lesson,
    LessonProgress,
    PathEvent,
    PathEventType,
    QuestionDifficulty,
    Skill,
    Subject,
    SubjectAgeGroup,
    Unit,
    UserLearningStatus,
    UserLearningStreak,
    UserPathEvent,
    UserPathEventStatus,
    UserSkillMastery,
)
from app.services.adaptive_learning import resolve_effective_learning_settings
from app.services.gamification import addXP, get_or_create_game_profile
from app.services.learning_retention import MissionDelta, get_active_season_bonus, track_mission_progress


@dataclass(slots=True)
class PathLessonNode:
    id: int
    title: str
    order: int
    xp_reward: int
    unlocked: bool
    completed: bool
    score: int | None
    stars_earned: int


@dataclass(slots=True)
class PathEventNode:
    id: str
    type: PathEventType
    title: str
    description: str | None
    icon_key: str
    rarity: str
    status: UserPathEventStatus
    order_index: int
    rules: dict[str, Any]
    reward_granted: bool


@dataclass(slots=True)
class PathNode:
    kind: str
    order_index: int
    lesson: PathLessonNode | None
    event: PathEventNode | None


@dataclass(slots=True)
class PathUnitBlock:
    id: int
    title: str
    description: str | None
    order: int
    completion_rate: float
    nodes: list[PathNode]


@dataclass(slots=True)
class LearningPathSnapshot:
    subject_id: int
    subject_name: str
    age_group: SubjectAgeGroup
    due_reviews_count: int
    streak_days: int
    mastery_average: float
    units: list[PathUnitBlock]


@dataclass(slots=True)
class EventStartSnapshot:
    event: PathEventNode
    payload: dict[str, Any]


@dataclass(slots=True)
class EventCompleteSnapshot:
    event: PathEventNode
    status: UserPathEventStatus
    rewards: dict[str, Any]
    passed: bool
    needs_retry: bool


def _resolve_subject(db: Session, *, subject_id: int | None) -> Subject:
    if subject_id is not None:
        subject = db.get(Subject, subject_id)
        if subject is None:
            raise ValueError("Subject not found")
        return subject
    subject = db.scalar(select(Subject).order_by(Subject.age_group.asc(), Subject.order.asc()))
    if subject is None:
        raise ValueError("No subject available")
    return subject


def _compute_lesson_stars(score: int | None) -> int:
    if score is None:
        return 0
    if score >= 85:
        return 3
    if score >= 70:
        return 2
    if score > 0:
        return 1
    return 0


def _unit_completion_rate(
    lessons: list[Lesson],
    progress_by_lesson: dict[int, LessonProgress],
) -> float:
    if not lessons:
        return 0.0
    completed = 0
    for lesson in lessons:
        row = progress_by_lesson.get(lesson.id)
        if row and row.completed:
            completed += 1
    return completed / len(lessons)


def _story_chance_hit(user_id: int, event_id: str) -> bool:
    bucket = datetime.now(UTC).strftime("%Y-%m-%d")
    seed = sha256(f"{user_id}:{event_id}:{bucket}".encode("utf-8")).hexdigest()[:8]
    value = int(seed, 16) % 100
    return value < 10


def _resolve_event_status(
    *,
    user_id: int,
    event: PathEvent,
    user_row: UserPathEvent | None,
    total_completed_lessons: int,
    due_reviews_count: int,
    streak_days: int,
    unit_completion: float,
) -> UserPathEventStatus:
    if user_row is not None and user_row.status in (UserPathEventStatus.COMPLETED, UserPathEventStatus.SKIPPED):
        return user_row.status

    rules = event.rules or {}
    if event.type == PathEventType.CHEST:
        threshold = int(rules.get("triggerAtCompletedLessons", rules.get("everyCompletedLessons", 5)))
        return UserPathEventStatus.AVAILABLE if total_completed_lessons >= threshold else UserPathEventStatus.LOCKED
    if event.type == PathEventType.CHECKPOINT:
        required = float(rules.get("requiredUnitCompletion", 0.4))
        return UserPathEventStatus.AVAILABLE if unit_completion >= required else UserPathEventStatus.LOCKED
    if event.type == PathEventType.MINI_BOSS:
        return UserPathEventStatus.AVAILABLE if unit_completion >= 1.0 else UserPathEventStatus.LOCKED
    if event.type == PathEventType.STORY_STOP:
        return UserPathEventStatus.AVAILABLE if _story_chance_hit(user_id, str(event.id)) else UserPathEventStatus.LOCKED
    if event.type == PathEventType.BOOST:
        required = int(rules.get("requiredStreakDays", 7))
        return UserPathEventStatus.AVAILABLE if streak_days >= required else UserPathEventStatus.LOCKED
    if event.type == PathEventType.REVIEW_GATE:
        threshold = int(rules.get("dueReviewsThreshold", 10))
        return UserPathEventStatus.AVAILABLE if due_reviews_count > threshold else UserPathEventStatus.COMPLETED
    return UserPathEventStatus.LOCKED


def _get_or_create_user_event(
    db: Session,
    *,
    user_id: int,
    event_id: str,
) -> UserPathEvent:
    row = db.scalar(
        select(UserPathEvent).where(
            UserPathEvent.user_id == user_id,
            UserPathEvent.event_id == event_id,
        )
    )
    if row is not None:
        return row
    row = UserPathEvent(
        user_id=user_id,
        event_id=event_id,
        status=UserPathEventStatus.LOCKED,
        reward_granted=False,
    )
    db.add(row)
    db.flush()
    return row


def _resolve_user_metrics(db: Session, *, user_id: int) -> tuple[int, int, float]:
    try:
        due_reviews_count = int(
            db.scalar(
                select(func.count(UserSkillMastery.id)).where(
                    UserSkillMastery.user_id == user_id,
                    UserSkillMastery.next_review_at.is_not(None),
                    UserSkillMastery.next_review_at <= datetime.now(UTC),
                )
            )
            or 0
        )
    except SQLAlchemyError:
        db.rollback()
        due_reviews_count = 0
    try:
        streak_row = db.scalar(select(UserLearningStreak).where(UserLearningStreak.user_id == user_id))
        streak_days = int(streak_row.current_streak if streak_row is not None else 0)
    except SQLAlchemyError:
        db.rollback()
        streak_days = 0
    try:
        mastery_avg = float(
            db.scalar(
                select(func.coalesce(func.avg(UserSkillMastery.mastery), 0)).where(UserSkillMastery.user_id == user_id)
            )
            or 0
        )
    except SQLAlchemyError:
        db.rollback()
        mastery_avg = 0.0
    return due_reviews_count, streak_days, mastery_avg


def build_learning_path(
    db: Session,
    *,
    user_id: int,
    subject_id: int | None,
) -> LearningPathSnapshot:
    subject = _resolve_subject(db, subject_id=subject_id)
    units = db.scalars(select(Unit).where(Unit.subject_id == subject.id).order_by(Unit.order.asc())).all()
    lessons = db.scalars(
        select(Lesson).join(Unit, Unit.id == Lesson.unit_id).where(Unit.subject_id == subject.id).order_by(Unit.order.asc(), Lesson.order.asc())
    ).all()
    lesson_ids = [item.id for item in lessons]
    progress_rows = db.scalars(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id,
            LessonProgress.lesson_id.in_(lesson_ids),
        )
    ).all()
    progress_by_lesson = {row.lesson_id: row for row in progress_rows}
    total_completed_lessons = sum(1 for row in progress_rows if row.completed)
    due_reviews_count, streak_days, mastery_average = _resolve_user_metrics(db, user_id=user_id)

    try:
        events = db.scalars(
            select(PathEvent).where(PathEvent.subject_id == subject.id).order_by(PathEvent.order_index.asc())
        ).all()
    except SQLAlchemyError:
        db.rollback()
        events = []
    try:
        user_events = db.scalars(select(UserPathEvent).where(UserPathEvent.user_id == user_id)).all()
    except SQLAlchemyError:
        db.rollback()
        user_events = []
    user_events_by_event_id = {str(row.event_id): row for row in user_events}

    lessons_by_unit: dict[int, list[Lesson]] = {}
    for lesson in lessons:
        lessons_by_unit.setdefault(lesson.unit_id, []).append(lesson)
    events_by_unit: dict[int | None, list[PathEvent]] = {}
    for event in events:
        events_by_unit.setdefault(event.unit_id, []).append(event)

    out_units: list[PathUnitBlock] = []
    for unit in units:
        unit_lessons = lessons_by_unit.get(unit.id, [])
        unit_completion = _unit_completion_rate(unit_lessons, progress_by_lesson)
        nodes: list[PathNode] = []
        for lesson in unit_lessons:
            row = progress_by_lesson.get(lesson.id)
            nodes.append(
                PathNode(
                    kind="LESSON",
                    order_index=(lesson.order * 10),
                    lesson=PathLessonNode(
                        id=lesson.id,
                        title=lesson.title,
                        order=lesson.order,
                        xp_reward=lesson.xp_reward,
                        unlocked=True,
                        completed=bool(row and row.completed),
                        score=row.score if row else None,
                        stars_earned=_compute_lesson_stars(row.score if row else None),
                    ),
                    event=None,
                )
            )
        for event in events_by_unit.get(unit.id, []):
            user_row = user_events_by_event_id.get(str(event.id))
            status = _resolve_event_status(
                user_id=user_id,
                event=event,
                user_row=user_row,
                total_completed_lessons=total_completed_lessons,
                due_reviews_count=due_reviews_count,
                streak_days=streak_days,
                unit_completion=unit_completion,
            )
            nodes.append(
                PathNode(
                    kind="EVENT",
                    order_index=event.order_index,
                    lesson=None,
                    event=PathEventNode(
                        id=str(event.id),
                        type=event.type,
                        title=event.title,
                        description=event.description,
                        icon_key=event.icon_key,
                        rarity=event.rarity.value,
                        status=status,
                        order_index=event.order_index,
                        rules=event.rules or {},
                        reward_granted=bool(user_row.reward_granted) if user_row else False,
                    ),
                )
            )
        if unit.order == 1:
            for event in events_by_unit.get(None, []):
                user_row = user_events_by_event_id.get(str(event.id))
                status = _resolve_event_status(
                    user_id=user_id,
                    event=event,
                    user_row=user_row,
                    total_completed_lessons=total_completed_lessons,
                    due_reviews_count=due_reviews_count,
                    streak_days=streak_days,
                    unit_completion=unit_completion,
                )
                nodes.append(
                    PathNode(
                        kind="EVENT",
                        order_index=event.order_index,
                        lesson=None,
                        event=PathEventNode(
                            id=str(event.id),
                            type=event.type,
                            title=event.title,
                            description=event.description,
                            icon_key=event.icon_key,
                            rarity=event.rarity.value,
                            status=status,
                            order_index=event.order_index,
                            rules=event.rules or {},
                            reward_granted=bool(user_row.reward_granted) if user_row else False,
                        ),
                    )
                )
        nodes.sort(key=lambda item: item.order_index)
        out_units.append(
            PathUnitBlock(
                id=unit.id,
                title=unit.title,
                description=unit.description,
                order=unit.order,
                completion_rate=unit_completion,
                nodes=nodes,
            )
        )

    return LearningPathSnapshot(
        subject_id=subject.id,
        subject_name=subject.name,
        age_group=subject.age_group,
        due_reviews_count=due_reviews_count,
        streak_days=streak_days,
        mastery_average=mastery_average,
        units=out_units,
    )


def start_path_event(
    db: Session,
    *,
    user_id: int,
    event_id: str,
) -> EventStartSnapshot:
    event = db.get(PathEvent, event_id)
    if event is None:
        raise ValueError("Event not found")
    snapshot = build_learning_path(db, user_id=user_id, subject_id=event.subject_id)
    status = UserPathEventStatus.LOCKED
    for unit in snapshot.units:
        for node in unit.nodes:
            if node.event and node.event.id == event_id:
                status = node.event.status
                break
    if status not in (UserPathEventStatus.AVAILABLE, UserPathEventStatus.COMPLETED):
        raise ValueError("Event is locked")

    row = _get_or_create_user_event(db, user_id=user_id, event_id=event_id)
    if row.status == UserPathEventStatus.LOCKED:
        row.status = UserPathEventStatus.AVAILABLE

    payload: dict[str, Any] = {"type": event.type.value}
    if event.type == PathEventType.CHECKPOINT:
        payload = {"adaptive": True, "maxQuestions": 6}
    elif event.type == PathEventType.MINI_BOSS:
        weakest_skills = db.execute(
            select(UserSkillMastery.skill_id)
            .where(UserSkillMastery.user_id == user_id)
            .order_by(UserSkillMastery.mastery.asc())
            .limit(3)
        ).all()
        payload = {"adaptive": True, "questions": 5, "focusSkills": [str(item[0]) for item in weakest_skills]}
    elif event.type == PathEventType.REVIEW_GATE:
        payload = {"dueReviewsThreshold": int((event.rules or {}).get("dueReviewsThreshold", 10))}

    db.flush()
    return EventStartSnapshot(
        event=PathEventNode(
            id=str(event.id),
            type=event.type,
            title=event.title,
            description=event.description,
            icon_key=event.icon_key,
            rarity=event.rarity.value,
            status=row.status,
            order_index=event.order_index,
            rules=event.rules or {},
            reward_granted=row.reward_granted,
        ),
        payload=payload,
    )


def complete_path_event(
    db: Session,
    *,
    user_id: int,
    event_id: str,
    result_summary: dict[str, Any],
    tenant_id: int | None,
) -> EventCompleteSnapshot:
    event = db.get(PathEvent, event_id)
    if event is None:
        raise ValueError("Event not found")

    row = _get_or_create_user_event(db, user_id=user_id, event_id=event_id)
    if row.status == UserPathEventStatus.COMPLETED and row.reward_granted:
        return EventCompleteSnapshot(
            event=PathEventNode(
                id=str(event.id),
                type=event.type,
                title=event.title,
                description=event.description,
                icon_key=event.icon_key,
                rarity=event.rarity.value,
                status=row.status,
                order_index=event.order_index,
                rules=event.rules or {},
                reward_granted=row.reward_granted,
            ),
            status=row.status,
            rewards={"coins": 0, "xp": 0},
            passed=True,
            needs_retry=False,
        )

    due_reviews_count, streak_days, mastery_average = _resolve_user_metrics(db, user_id=user_id)
    score = int(result_summary.get("score", 100))
    skip_requested = bool(result_summary.get("skip", False))
    passed = True
    needs_retry = False

    if event.type == PathEventType.MINI_BOSS and score < 70:
        passed = False
        needs_retry = True
    if event.type == PathEventType.REVIEW_GATE and due_reviews_count > int((event.rules or {}).get("dueReviewsThreshold", 10)):
        passed = False
        needs_retry = True

    rewards = {"coins": 0, "xp": 0, "boostMultiplier": 1.0, "boostExpiresAt": None}
    season_bonus = get_active_season_bonus(db)
    if not skip_requested and passed and not row.reward_granted:
        effective = resolve_effective_learning_settings(db, tenant_id=tenant_id)
        profile = get_or_create_game_profile(db, user_id=user_id)
        xp_before = profile.xp
        coins_before = profile.axion_coins
        if event.type == PathEventType.CHEST:
            coin_steps = ((event.rules or {}).get("rewards", {}) or {}).get("coins", [5, 10, 15])
            tier = 0
            if streak_days >= 7:
                tier += 1
            if mastery_average >= 0.6:
                tier += 1
            base_coins = int(coin_steps[min(tier, len(coin_steps) - 1)])
            rewards["coins"] = max(0, int(round(base_coins * season_bonus.coin_multiplier)))
            profile.axion_coins += rewards["coins"]
        elif event.type in (PathEventType.CHECKPOINT, PathEventType.MINI_BOSS, PathEventType.STORY_STOP):
            base_xp = 12 if event.type == PathEventType.STORY_STOP else 20 if event.type == PathEventType.CHECKPOINT else 35
            rewards["xp"] = max(0, int(round(base_xp * season_bonus.xp_multiplier)))
            addXP(
                db,
                user_id=user_id,
                xp_amount=rewards["xp"],
                max_xp_per_day=effective.max_daily_learning_xp,
            )
        elif event.type == PathEventType.BOOST:
            status = db.scalar(select(UserLearningStatus).where(UserLearningStatus.user_id == user_id))
            if status is None:
                status = UserLearningStatus(user_id=user_id, energy=5, last_energy_update=datetime.now(UTC))
                db.add(status)
                db.flush()
            status.event_boost_multiplier = 1.20
            status.event_boost_expires_at = datetime.now(UTC) + timedelta(hours=24)
            rewards["boostMultiplier"] = 1.2
            rewards["boostExpiresAt"] = status.event_boost_expires_at.isoformat()

        row.reward_granted = True
        rewards["xp"] = max(0, profile.xp - xp_before)
        rewards["coins"] = max(rewards["coins"], max(0, profile.axion_coins - coins_before))

    if skip_requested and event.type != PathEventType.REVIEW_GATE:
        row.status = UserPathEventStatus.SKIPPED
    elif passed:
        row.status = UserPathEventStatus.COMPLETED
        row.completed_at = datetime.now(UTC)
    else:
        row.status = UserPathEventStatus.AVAILABLE

    if passed and not skip_requested:
        try:
            track_mission_progress(
                db,
                user_id=user_id,
                tenant_id=tenant_id,
                delta=MissionDelta(
                    xp_gained=int(rewards.get("xp", 0) or 0),
                    mini_boss_wins=1 if event.type == PathEventType.MINI_BOSS else 0,
                    checkpoint_completed=1 if event.type == PathEventType.CHECKPOINT else 0,
                ),
                auto_claim=True,
            )
        except SQLAlchemyError:
            db.rollback()

    db.flush()
    return EventCompleteSnapshot(
        event=PathEventNode(
            id=str(event.id),
            type=event.type,
            title=event.title,
            description=event.description,
            icon_key=event.icon_key,
            rarity=event.rarity.value,
            status=row.status,
            order_index=event.order_index,
            rules=event.rules or {},
            reward_granted=row.reward_granted,
        ),
        status=row.status,
        rewards=rewards,
        passed=passed,
        needs_retry=needs_retry,
    )
