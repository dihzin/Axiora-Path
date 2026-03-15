from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from app.models_learning import StudentLessonProgress, StudentSkillMastery, StudentSubjectState
from app.services.learning_repository import (
    get_student_progress,
    get_student_skill_state,
    register_lesson_completion,
    update_skill_mastery,
)


class _FakeLearningDB:
    def __init__(self) -> None:
        self.skill_rows: dict[tuple[int, str], StudentSkillMastery] = {}
        self.lesson_rows: dict[tuple[int, int], StudentLessonProgress] = {}
        self.subject_rows: dict[tuple[int, int], StudentSubjectState] = {}

    def scalar(self, query: Any) -> Any:
        text = str(query)
        params = query.compile().params if hasattr(query, "compile") else {}
        if "FROM student_skill_mastery" in text:
            return self.skill_rows.get((int(params["student_id_1"]), str(params["skill_id_1"])))
        if "FROM student_lesson_progress" in text and "count(" not in text.lower():
            return self.lesson_rows.get((int(params["student_id_1"]), int(params["lesson_id_1"])))
        if "FROM student_subject_state" in text:
            return self.subject_rows.get((int(params["student_id_1"]), int(params["subject_id_1"])))
        if "count(student_lesson_progress.id)" in text.lower():
            student_id = int(params["student_id_1"])
            if "completed IS true" in text:
                return sum(
                    1 for (sid, _), row in self.lesson_rows.items() if sid == student_id and bool(row.completed)
                )
            return sum(1 for (sid, _), _row in self.lesson_rows.items() if sid == student_id)
        return None

    def add(self, obj: Any) -> None:
        if isinstance(obj, StudentSkillMastery):
            self.skill_rows[(int(obj.student_id), str(obj.skill_id))] = obj
        if isinstance(obj, StudentLessonProgress):
            self.lesson_rows[(int(obj.student_id), int(obj.lesson_id))] = obj
        if isinstance(obj, StudentSubjectState):
            self.subject_rows[(int(obj.student_id), int(obj.subject_id))] = obj


def test_update_skill_mastery_creates_and_updates_state() -> None:
    db = _FakeLearningDB()

    created = update_skill_mastery(
        db,  # type: ignore[arg-type]
        student_id=9,
        skill_id="skill-a",
        mastery=0.7,
        confidence=0.8,
        velocity=0.12,
    )
    loaded = get_student_skill_state(db, student_id=9, skill_id="skill-a")  # type: ignore[arg-type]

    assert created is loaded
    assert round(float(created.mastery), 4) == 0.7
    assert round(float(created.confidence), 4) == 0.8
    assert round(float(created.velocity), 4) == 0.12


def test_register_lesson_completion_updates_subject_progress() -> None:
    db = _FakeLearningDB()

    row = register_lesson_completion(
        db,  # type: ignore[arg-type]
        student_id=4,
        lesson_id=101,
        subject_id=7,
        completed=True,
        score=95,
        stars=3,
        time_spent=180,
        current_skill="skill-b",
    )

    snapshot = get_student_progress(db, student_id=4, subject_id=7)  # type: ignore[arg-type]

    assert row.completed is True
    assert row.score == 95
    assert row.stars == 3
    assert row.attempts == 1
    assert row.time_spent == 180
    assert snapshot is not None
    assert snapshot.current_skill == "skill-b"
    assert snapshot.current_lesson == 101
    assert snapshot.completed_lessons == 1
    assert snapshot.progress == 1.0


def test_register_lesson_completion_accumulates_attempts_and_time() -> None:
    db = _FakeLearningDB()

    register_lesson_completion(
        db,  # type: ignore[arg-type]
        student_id=5,
        lesson_id=202,
        subject_id=8,
        completed=False,
        score=40,
        stars=1,
        time_spent=90,
        current_skill="skill-c",
    )
    row = register_lesson_completion(
        db,  # type: ignore[arg-type]
        student_id=5,
        lesson_id=202,
        subject_id=8,
        completed=True,
        score=88,
        stars=2,
        time_spent=110,
        current_skill="skill-c",
    )

    assert row.attempts == 2
    assert row.time_spent == 200
    assert row.completed is True
