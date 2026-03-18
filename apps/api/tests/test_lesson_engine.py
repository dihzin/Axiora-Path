from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from app.models import QuestionDifficulty
from app.services.lesson_engine import LessonEngine, StudentSkillState


def test_determine_difficulty_caps_for_younger_age_groups() -> None:
    engine = LessonEngine.__new__(LessonEngine)

    assert (
        engine.determine_difficulty(StudentSkillState(mastery=0.9, age_group="6-8"))
        == QuestionDifficulty.EASY
    )
    assert (
        engine.determine_difficulty(StudentSkillState(mastery=0.9, age_group="9-12"))
        == QuestionDifficulty.MEDIUM
    )
    assert (
        engine.determine_difficulty(StudentSkillState(mastery=0.9, age_group="13-15"))
        == QuestionDifficulty.HARD
    )


def test_create_lesson_uses_centralized_generation(monkeypatch) -> None:
    engine = LessonEngine.__new__(LessonEngine)
    engine.db = object()
    engine.tenant_id = 7

    monkeypatch.setattr(
        engine,
        "_get_skill",
        lambda _skill: SimpleNamespace(id="skill-1", subject_id=22, age_group=SimpleNamespace(value="9-12")),
    )
    monkeypatch.setattr(
        engine,
        "_load_student_skill_state",
        lambda **_kwargs: StudentSkillState(mastery=0.8, age_group="9-12"),
    )
    monkeypatch.setattr(engine, "determine_difficulty", lambda _state: QuestionDifficulty.MEDIUM)
    monkeypatch.setattr(
        engine,
        "generate_lesson_contents",
        lambda **_kwargs: SimpleNamespace(items=["q1"], diagnostics={"candidates_raw": 1}),
    )

    lesson = engine.create_lesson(student_id=10, skill="skill-1")

    assert lesson.skill_id == "skill-1"
    assert lesson.subject_id == 22
    assert lesson.difficulty == QuestionDifficulty.MEDIUM
    assert lesson.contents.items == ["q1"]


def test_learning_route_uses_lesson_engine() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "apps" / "api" / "app" / "api" / "routes" / "learning.py").read_text(
        encoding="utf-8"
    )

    assert "from app.services.lesson_engine import LessonEngine" in source
    assert "LessonEngine(db, tenant_id=tenant.id).generate_lesson_contents(" in source
    assert "build_next_questions(" not in source


def test_lesson_engine_avoids_duplicate_prompt_pick_when_possible() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "apps" / "api" / "app" / "services" / "lesson_engine.py").read_text(
        encoding="utf-8"
    )

    assert "def _prompt_key(" in source
    assert "if self._prompt_key(picked.prompt) in {self._prompt_key(existing.prompt) for existing in items}:" in source


def test_lesson_page_uses_session_target_for_right_rail_and_requires_server_finish() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root / "apps" / "web" / "app" / "(app)" / "child" / "aprender" / "lesson" / "[id]" / "page.tsx"
    ).read_text(encoding="utf-8")

    assert "const stepTotal = Math.max(1, sessionTargetQuestions);" in source
    assert "buildFinishFallbackFromSession" not in source
