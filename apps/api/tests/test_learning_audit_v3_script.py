from __future__ import annotations

from pathlib import Path


def test_learning_audit_v3_script_exists_and_covers_core_rules() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "tools" / "audit_learning_system_v3.py").read_text(encoding="utf-8")

    assert "def run_audit()" in source
    assert "canonical_curriculum_exists" in source
    assert "subject_must_have_skills" in source
    assert "skill_must_have_lessons" in source
    assert "lesson_must_have_generator" in source
    assert "lesson_must_have_age_rule" in source
    assert "progress_must_be_persisted" in source
    assert "api_routes_connected_to_lesson_engine" in source
    assert "frontend_nodes_connected_to_api" in source
    assert "learning_audit_v3.json" in source
    assert "learning_audit_v3_report.txt" in source
