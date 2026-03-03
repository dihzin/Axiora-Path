from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from app.models import Lesson, LessonDifficulty, LessonProgress, LessonType, Unit
from app.services import aprender


class _FakeLessonDB:
    def __init__(self, *, lesson: Lesson, unit: Unit) -> None:
        self.lesson = lesson
        self.unit = unit
        self.progress: LessonProgress | None = None

    def get(self, model: Any, key: Any) -> Any:
        if model is Lesson and int(key) == int(self.lesson.id):
            return self.lesson
        if model is Unit and int(key) == int(self.unit.id):
            return self.unit
        return None

    def scalar(self, query: Any) -> Any:
        if "FROM lesson_progress" in str(query):
            return self.progress
        return None

    def add(self, obj: Any) -> None:
        if isinstance(obj, LessonProgress):
            if getattr(obj, "id", None) is None:
                obj.id = 1
            self.progress = obj

    def flush(self) -> None:
        return


def test_xp_increments_after_lesson_completion(monkeypatch: Any) -> None:
    lesson = Lesson(
        id=101,
        unit_id=11,
        title="Licao XP",
        order=1,
        xp_reward=40,
        difficulty=LessonDifficulty.EASY,
        type=LessonType.QUIZ,
    )
    unit = Unit(id=11, subject_id=7, title="Unidade", description=None, order=1, required_level=1)
    db = _FakeLessonDB(lesson=lesson, unit=unit)

    profile = SimpleNamespace(xp=120, level=2, daily_xp=0, axion_coins=0)
    learning_status = SimpleNamespace(unit_boost_multiplier=1.0, unit_boost_remaining_lessons=0)

    path = SimpleNamespace(
        units=[
            SimpleNamespace(
                lessons=[
                    SimpleNamespace(lesson=lesson, unlocked=True),
                ]
            )
        ]
    )

    monkeypatch.setattr(aprender, "build_subject_path", lambda *_args, **_kwargs: path)
    monkeypatch.setattr(aprender, "_get_or_create_learning_status", lambda *_args, **_kwargs: learning_status)
    monkeypatch.setattr(aprender, "_resolve_learning_settings", lambda *_args, **_kwargs: (9999, 1.0))
    monkeypatch.setattr(aprender, "_is_unit_completed", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(aprender, "register_learning_lesson_completion", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(aprender, "evaluate_achievements_after_learning", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(aprender, "get_or_create_game_profile", lambda *_args, **_kwargs: profile)

    def _fake_add_xp(*_args: Any, **kwargs: Any) -> Any:
        xp_amount = max(0, int(kwargs.get("xp_amount", 0)))
        profile.xp += xp_amount
        profile.daily_xp += xp_amount
        profile.level = (profile.xp // 100) + 1
        return profile

    monkeypatch.setattr(aprender, "addXP", _fake_add_xp)

    xp_before = profile.xp
    first = aprender.complete_lesson(
        db,  # type: ignore[arg-type]
        user_id=55,
        lesson_id=lesson.id,
        score=100,
        tenant_id=1,
    )
    xp_after_first = profile.xp

    replay = aprender.complete_lesson(
        db,  # type: ignore[arg-type]
        user_id=55,
        lesson_id=lesson.id,
        score=100,
        tenant_id=1,
    )

    assert first.xp_requested > 0
    assert first.xp_granted == first.xp_requested
    assert xp_after_first == xp_before + first.xp_granted
    assert replay.xp_requested == 0
    assert replay.xp_granted == 0
    assert profile.xp == xp_after_first
    assert db.progress is not None
    assert db.progress.attempts == 2
    assert db.progress.completed is True
    assert db.progress.xp_granted == first.xp_granted
