from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models_learning import StudentLessonProgress, StudentSkillMastery, StudentSubjectState


@dataclass(frozen=True, slots=True)
class StudentProgressSnapshot:
    student_id: int
    subject_id: int
    progress: float
    current_skill: str | None
    current_lesson: int | None
    completed_lessons: int


def get_student_skill_state(
    db: Session,
    *,
    student_id: int,
    skill_id: str,
) -> StudentSkillMastery | None:
    return db.scalar(
        select(StudentSkillMastery).where(
            StudentSkillMastery.student_id == int(student_id),
            StudentSkillMastery.skill_id == str(skill_id),
        )
    )


def update_skill_mastery(
    db: Session,
    *,
    student_id: int,
    skill_id: str,
    mastery: float,
    confidence: float,
    velocity: float,
) -> StudentSkillMastery:
    row = get_student_skill_state(db, student_id=student_id, skill_id=skill_id)
    if row is None:
        row = StudentSkillMastery(
            student_id=int(student_id),
            skill_id=str(skill_id),
            mastery=0,
            confidence=0,
            velocity=0,
            last_updated=datetime.now(UTC),
        )
        db.add(row)

    row.mastery = _clamp(mastery)
    row.confidence = _clamp(confidence)
    row.velocity = float(velocity)
    row.last_updated = datetime.now(UTC)
    return row


def register_lesson_completion(
    db: Session,
    *,
    student_id: int,
    lesson_id: int,
    subject_id: int,
    completed: bool,
    score: int | None,
    stars: int,
    time_spent: int,
    current_skill: str | None = None,
) -> StudentLessonProgress:
    progress_row = db.scalar(
        select(StudentLessonProgress).where(
            StudentLessonProgress.student_id == int(student_id),
            StudentLessonProgress.lesson_id == int(lesson_id),
        )
    )
    if progress_row is None:
        progress_row = StudentLessonProgress(
            student_id=int(student_id),
            lesson_id=int(lesson_id),
            completed=False,
            score=None,
            stars=0,
            attempts=0,
            time_spent=0,
        )
        db.add(progress_row)

    progress_row.attempts = int(getattr(progress_row, "attempts", 0) or 0) + 1
    progress_row.completed = bool(completed)
    progress_row.score = None if score is None else int(score)
    progress_row.stars = max(0, min(3, int(stars)))
    progress_row.time_spent = max(0, int(getattr(progress_row, "time_spent", 0) or 0)) + max(0, int(time_spent))

    subject_state = db.scalar(
        select(StudentSubjectState).where(
            StudentSubjectState.student_id == int(student_id),
            StudentSubjectState.subject_id == int(subject_id),
        )
    )
    if subject_state is None:
        subject_state = StudentSubjectState(
            student_id=int(student_id),
            subject_id=int(subject_id),
            progress=0,
            current_skill=current_skill,
            current_lesson=int(lesson_id),
        )
        db.add(subject_state)

    subject_state.current_skill = None if current_skill is None else str(current_skill)
    subject_state.current_lesson = int(lesson_id)
    completed_lessons = int(
        db.scalar(
            select(func.count(StudentLessonProgress.id)).where(
                StudentLessonProgress.student_id == int(student_id),
                StudentLessonProgress.completed.is_(True),
            )
        )
        or 0
    )
    tracked_lessons = int(
        db.scalar(
            select(func.count(StudentLessonProgress.id)).where(
                StudentLessonProgress.student_id == int(student_id),
            )
        )
        or 0
    )
    subject_state.progress = _clamp(completed_lessons / max(1, tracked_lessons))
    return progress_row


def get_student_progress(
    db: Session,
    *,
    student_id: int,
    subject_id: int,
) -> StudentProgressSnapshot | None:
    state = db.scalar(
        select(StudentSubjectState).where(
            StudentSubjectState.student_id == int(student_id),
            StudentSubjectState.subject_id == int(subject_id),
        )
    )
    if state is None:
        return None

    completed_lessons = int(
        db.scalar(
            select(func.count(StudentLessonProgress.id)).where(
                StudentLessonProgress.student_id == int(student_id),
                StudentLessonProgress.completed.is_(True),
            )
        )
        or 0
    )
    return StudentProgressSnapshot(
        student_id=int(state.student_id),
        subject_id=int(state.subject_id),
        progress=float(state.progress),
        current_skill=None if state.current_skill is None else str(state.current_skill),
        current_lesson=None if state.current_lesson is None else int(state.current_lesson),
        completed_lessons=completed_lessons,
    )


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))
