from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    ChildProfile,
    GameSettings,
    Lesson,
    LessonContent,
    LessonDifficulty,
    LessonProgress,
    Subject,
    SubjectAgeGroup,
    Unit,
    UserLearningStatus,
)
from app.services.achievement_engine import evaluate_achievements_after_learning
from app.services.gamification import addXP, get_or_create_game_profile
from app.services.learning_streak import LearningStreakSnapshot, register_learning_lesson_completion


DEFAULT_MAX_DAILY_LEARNING_XP = 200
DEFAULT_LEARNING_COIN_MULTIPLIER = 1.0
THREE_STAR_BONUS_COINS = 10
UNIT_COMPLETION_BOOST_MULTIPLIER = 1.30
UNIT_COMPLETION_BOOST_LESSONS = 3


class LessonNotFoundError(ValueError):
    pass


class SubjectNotFoundError(ValueError):
    pass


class LessonLockedError(PermissionError):
    pass


@dataclass(slots=True)
class LessonUnlockStatus:
    lesson: Lesson
    unlocked: bool
    completed: bool
    score: int | None
    completed_at: datetime | None


@dataclass(slots=True)
class UnitPathStatus:
    unit: Unit
    unlocked: bool
    completion_rate: float
    lessons: list[LessonUnlockStatus]


@dataclass(slots=True)
class SubjectPathStatus:
    subject: Subject
    user_level: int
    units: list[UnitPathStatus]


@dataclass(slots=True)
class CompleteLessonResult:
    progress: LessonProgress
    xp_requested: int
    xp_granted: int
    profile_xp: int
    profile_level: int
    profile_daily_xp: int
    repeat_required: bool
    variation_seed: str | None
    coins_requested: int
    coins_granted: int
    coin_multiplier_applied: float
    unit_boost_activated: bool
    unit_boost_multiplier: float
    unit_boost_remaining_lessons: int
    unlocked_achievements: list[str]
    learning_streak: LearningStreakSnapshot | None


def age_group_from_birth_year(*, birth_year: int | None, now_year: int) -> SubjectAgeGroup:
    if birth_year is None:
        return SubjectAgeGroup.AGE_9_12
    age = max(0, now_year - birth_year)
    if age <= 8:
        return SubjectAgeGroup.AGE_6_8
    if age <= 12:
        return SubjectAgeGroup.AGE_9_12
    return SubjectAgeGroup.AGE_13_15


def get_child_age_group(db: Session, *, child_id: int, now_year: int) -> SubjectAgeGroup:
    child = db.get(ChildProfile, child_id)
    if child is None:
        return SubjectAgeGroup.AGE_9_12
    return age_group_from_birth_year(birth_year=child.birth_year, now_year=now_year)


def _difficulty_multiplier(difficulty: LessonDifficulty) -> float:
    if difficulty == LessonDifficulty.HARD:
        return 1.5
    if difficulty == LessonDifficulty.MEDIUM:
        return 1.25
    return 1.0


def is_difficulty_allowed_for_age_group(
    *,
    difficulty: LessonDifficulty,
    age_group: SubjectAgeGroup,
) -> bool:
    if age_group == SubjectAgeGroup.AGE_6_8:
        return difficulty == LessonDifficulty.EASY
    if age_group == SubjectAgeGroup.AGE_9_12:
        return difficulty in (LessonDifficulty.EASY, LessonDifficulty.MEDIUM)
    return True


def _lessons_by_unit(db: Session, unit_ids: list[int]) -> dict[int, list[Lesson]]:
    if not unit_ids:
        return {}
    rows = db.scalars(
        select(Lesson)
        .where(Lesson.unit_id.in_(unit_ids))
        .order_by(Lesson.unit_id.asc(), Lesson.order.asc()),
    ).all()
    grouped: dict[int, list[Lesson]] = {}
    for lesson in rows:
        grouped.setdefault(lesson.unit_id, []).append(lesson)
    return grouped


def _progress_by_lesson(
    db: Session, *, user_id: int, lesson_ids: list[int]
) -> dict[int, LessonProgress]:
    if not lesson_ids:
        return {}
    rows = db.scalars(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id,
            LessonProgress.lesson_id.in_(lesson_ids),
        ),
    ).all()
    return {row.lesson_id: row for row in rows}


def build_subject_path(db: Session, *, user_id: int, subject_id: int) -> SubjectPathStatus:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise SubjectNotFoundError("Subject not found")

    units = db.scalars(
        select(Unit).where(Unit.subject_id == subject_id).order_by(Unit.order.asc())
    ).all()
    unit_ids = [unit.id for unit in units]
    lessons_by_unit = _lessons_by_unit(db, unit_ids)
    lesson_ids = [lesson.id for lessons in lessons_by_unit.values() for lesson in lessons]
    progress_by_lesson = _progress_by_lesson(db, user_id=user_id, lesson_ids=lesson_ids)

    profile = get_or_create_game_profile(db, user_id=user_id)
    user_level = profile.level

    units_out: list[UnitPathStatus] = []
    previous_completion = 1.0
    for index, unit in enumerate(units):
        unit_lessons = lessons_by_unit.get(unit.id, [])
        completed_count = sum(
            1
            for lesson in unit_lessons
            if bool(
                progress_by_lesson.get(lesson.id, None)
                and progress_by_lesson[lesson.id].completed
            )
        )
        total_count = len(unit_lessons)
        completion_rate = (completed_count / total_count) if total_count > 0 else 1.0

        if index == 0:
            unit_unlocked = user_level >= unit.required_level
        else:
            unit_unlocked = previous_completion >= 0.8 and user_level >= unit.required_level

        lesson_statuses: list[LessonUnlockStatus] = []
        previous_lesson_completed = False
        for lesson_index, lesson in enumerate(unit_lessons):
            progress = progress_by_lesson.get(lesson.id)
            is_completed = bool(progress and progress.completed)
            if lesson_index == 0:
                lesson_unlocked = unit_unlocked
            else:
                lesson_unlocked = unit_unlocked and previous_lesson_completed
            if is_completed:
                lesson_unlocked = True

            lesson_statuses.append(
                LessonUnlockStatus(
                    lesson=lesson,
                    unlocked=lesson_unlocked,
                    completed=is_completed,
                    score=progress.score if progress is not None else None,
                    completed_at=progress.completed_at if progress is not None else None,
                )
            )
            previous_lesson_completed = is_completed

        units_out.append(
            UnitPathStatus(
                unit=unit,
                unlocked=unit_unlocked,
                completion_rate=completion_rate,
                lessons=lesson_statuses,
            )
        )
        previous_completion = completion_rate

    return SubjectPathStatus(subject=subject, user_level=user_level, units=units_out)


def list_lesson_contents(db: Session, *, lesson_id: int) -> list[LessonContent]:
    return list(
        db.scalars(
            select(LessonContent)
            .where(LessonContent.lesson_id == lesson_id)
            .order_by(LessonContent.order.asc()),
        ).all()
    )


def _resolve_learning_settings(
    db: Session,
    *,
    tenant_id: int | None,
) -> tuple[int, float]:
    if tenant_id is None:
        return DEFAULT_MAX_DAILY_LEARNING_XP, DEFAULT_LEARNING_COIN_MULTIPLIER
    child_ids = db.scalars(
        select(ChildProfile.id)
        .where(
            ChildProfile.tenant_id == tenant_id,
            ChildProfile.deleted_at.is_(None),
        )
        .order_by(ChildProfile.id.asc())
    ).all()
    if len(child_ids) != 1:
        return DEFAULT_MAX_DAILY_LEARNING_XP, DEFAULT_LEARNING_COIN_MULTIPLIER

    settings = db.scalar(
        select(GameSettings).where(
            GameSettings.tenant_id == tenant_id,
            GameSettings.child_id == child_ids[0],
        ),
    )
    if settings is None:
        return DEFAULT_MAX_DAILY_LEARNING_XP, DEFAULT_LEARNING_COIN_MULTIPLIER
    return (
        max(0, settings.max_daily_learning_xp),
        max(0.0, float(settings.learning_coin_reward_multiplier)),
    )


def _get_or_create_learning_status(db: Session, *, user_id: int) -> UserLearningStatus:
    status = db.scalar(select(UserLearningStatus).where(UserLearningStatus.user_id == user_id))
    if status is not None:
        return status
    status = UserLearningStatus(
        user_id=user_id,
        energy=5,
        last_energy_update=datetime.now(UTC),
        unit_boost_multiplier=1.0,
        unit_boost_remaining_lessons=0,
    )
    db.add(status)
    db.flush()
    return status


def _is_unit_completed(db: Session, *, unit_id: int, user_id: int) -> bool:
    total_lessons = db.scalar(select(func.count(Lesson.id)).where(Lesson.unit_id == unit_id)) or 0
    if total_lessons <= 0:
        return False
    completed_lessons = (
        db.scalar(
            select(func.count(LessonProgress.id))
            .join(Lesson, Lesson.id == LessonProgress.lesson_id)
            .where(
                Lesson.unit_id == unit_id,
                LessonProgress.user_id == user_id,
                LessonProgress.completed.is_(True),
            ),
        )
        or 0
    )
    return int(completed_lessons) >= int(total_lessons)


def complete_lesson(
    db: Session,
    *,
    user_id: int,
    lesson_id: int,
    score: int | None,
    tenant_id: int | None = None,
    grant_economy_rewards: bool = True,
) -> CompleteLessonResult:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise LessonNotFoundError("Lesson not found")

    unit = db.get(Unit, lesson.unit_id)
    if unit is None:
        raise LessonNotFoundError("Lesson unit not found")

    path = build_subject_path(db, user_id=user_id, subject_id=unit.subject_id)
    unlock_map = {
        status.lesson.id: status.unlocked
        for unit_status in path.units
        for status in unit_status.lessons
    }
    if not unlock_map.get(lesson_id, False):
        raise LessonLockedError("Lesson is locked")

    progress = db.scalar(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id,
            LessonProgress.lesson_id == lesson_id,
        ),
    )
    now = datetime.now(UTC)
    score_value = 100 if score is None else max(0, min(100, score))
    pass_threshold = 60
    repeat_required = score_value < pass_threshold
    stars = 3 if score_value >= 90 else 2 if score_value >= 60 else 1
    unit_completed_before = _is_unit_completed(db, unit_id=unit.id, user_id=user_id)
    if progress is None:
        progress = LessonProgress(
            user_id=user_id,
            lesson_id=lesson_id,
            completed=not repeat_required,
            score=score_value,
            attempts=1,
            repeat_required=repeat_required,
            variation_seed=str(uuid4()) if repeat_required else None,
            completed_at=None if repeat_required else now,
        )
        db.add(progress)
        was_completed = False
    else:
        was_completed = progress.completed
        progress.attempts += 1
        progress.score = score_value
        if repeat_required:
            progress.completed = False
            progress.repeat_required = True
            progress.variation_seed = str(uuid4())
            progress.completed_at = None
        else:
            progress.completed = True
            progress.repeat_required = False
            progress.variation_seed = None
            progress.completed_at = now

    learning_status = _get_or_create_learning_status(db, user_id=user_id)
    active_unit_boost_multiplier = (
        float(learning_status.unit_boost_multiplier)
        if learning_status.unit_boost_remaining_lessons > 0 and float(learning_status.unit_boost_multiplier) > 1.0
        else 1.0
    )
    multiplier = _difficulty_multiplier(lesson.difficulty)
    score_factor = score_value / 100.0
    scaled_xp = int(
        round(max(0, lesson.xp_reward) * multiplier * score_factor * active_unit_boost_multiplier)
    )
    xp_requested = 0 if was_completed or repeat_required else scaled_xp
    profile = get_or_create_game_profile(db, user_id=user_id)
    max_daily_learning_xp, learning_coin_multiplier = _resolve_learning_settings(
        db,
        tenant_id=tenant_id,
    )
    before_xp = profile.xp
    before_coins = profile.axion_coins

    if xp_requested > 0 and grant_economy_rewards:
        profile = addXP(
            db,
            user_id=user_id,
            xp_amount=xp_requested,
            max_xp_per_day=max_daily_learning_xp,
        )
        if active_unit_boost_multiplier > 1.0 and learning_status.unit_boost_remaining_lessons > 0:
            learning_status.unit_boost_remaining_lessons -= 1
            if learning_status.unit_boost_remaining_lessons <= 0:
                learning_status.unit_boost_multiplier = 1.0

    db.flush()
    xp_granted = max(0, profile.xp - before_xp)
    progress.xp_granted = xp_granted
    coins_requested = (
        int(round(THREE_STAR_BONUS_COINS * learning_coin_multiplier))
        if progress.completed and not was_completed and stars == 3 and grant_economy_rewards
        else 0
    )
    if coins_requested > 0:
        profile.axion_coins += coins_requested
    db.flush()
    coins_granted = max(0, profile.axion_coins - before_coins)

    unit_boost_activated = False
    if progress.completed and not unit_completed_before and _is_unit_completed(db, unit_id=unit.id, user_id=user_id):
        learning_status.unit_boost_multiplier = UNIT_COMPLETION_BOOST_MULTIPLIER
        learning_status.unit_boost_remaining_lessons = UNIT_COMPLETION_BOOST_LESSONS
        unit_boost_activated = True

    unlocked_achievements: list[str] = []
    streak_snapshot: LearningStreakSnapshot | None = None
    if progress.completed:
        streak_snapshot = register_learning_lesson_completion(
            db,
            user_id=user_id,
            completion_at=progress.completed_at,
        )
        unlocked_achievements = evaluate_achievements_after_learning(
            db,
            user_id=user_id,
            profile=profile,
            stars=stars,
        )
    return CompleteLessonResult(
        progress=progress,
        xp_requested=xp_requested,
        xp_granted=xp_granted,
        profile_xp=profile.xp,
        profile_level=profile.level,
        profile_daily_xp=profile.daily_xp,
        repeat_required=progress.repeat_required,
        variation_seed=progress.variation_seed,
        coins_requested=coins_requested,
        coins_granted=coins_granted,
        coin_multiplier_applied=learning_coin_multiplier,
        unit_boost_activated=unit_boost_activated,
        unit_boost_multiplier=float(learning_status.unit_boost_multiplier),
        unit_boost_remaining_lessons=learning_status.unit_boost_remaining_lessons,
        unlocked_achievements=unlocked_achievements,
        learning_streak=streak_snapshot,
    )
