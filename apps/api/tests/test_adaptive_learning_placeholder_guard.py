from __future__ import annotations

from pathlib import Path


def test_adaptive_learning_excludes_placeholder_seed_questions() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "apps" / "api" / "app" / "services" / "adaptive_learning.py").read_text(encoding="utf-8")

    assert "~Question.prompt.contains(\"Pergunta essencial\")" in source


def test_lesson_engine_excludes_placeholder_seed_questions() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "apps" / "api" / "app" / "services" / "lesson_engine.py").read_text(encoding="utf-8")

    assert "~Question.prompt.contains(\"Pergunta essencial\")" in source


def test_runtime_focus_skills_are_filtered_to_playable_content() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    adaptive_source = (repo_root / "apps" / "api" / "app" / "services" / "adaptive_learning.py").read_text(encoding="utf-8")
    lesson_engine_source = (repo_root / "apps" / "api" / "app" / "services" / "lesson_engine.py").read_text(encoding="utf-8")

    assert "def _skill_has_candidate_content(" in adaptive_source
    assert "playable_focus_skills = [" in adaptive_source
    assert "playable_focus_skills = [" in lesson_engine_source


def test_runtime_generation_uses_request_seed_to_reduce_repeat_between_calls() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    adaptive_source = (repo_root / "apps" / "api" / "app" / "services" / "adaptive_learning.py").read_text(encoding="utf-8")
    lesson_engine_source = (repo_root / "apps" / "api" / "app" / "services" / "lesson_engine.py").read_text(encoding="utf-8")

    assert "request_seed = now.isoformat(timespec=\"microseconds\")" in adaptive_source
    assert "request_seed=request_seed" in adaptive_source
    assert 'sha256(f"{request_seed}:question:{item.id}"' in adaptive_source
    assert "request_seed = now.isoformat(timespec=\"microseconds\")" in lesson_engine_source
    assert "request_seed=request_seed" in lesson_engine_source
    assert 'sha256(f"{request_seed}:question:{item.id}"' in lesson_engine_source
