from __future__ import annotations

from pathlib import Path


def test_question_quality_audit_script_exists_and_checks_objective_integrity() -> None:
    root = Path(__file__).resolve().parents[1]
    script = root / "scripts" / "audit_question_quality.py"
    assert script.exists(), f"Missing script: {script}"
    content = script.read_text(encoding="utf-8").lower()
    assert "missing_options" in content
    assert "missing_correct_option_id" in content
    assert "correct_option_id_not_in_options" in content
    assert "--fix" in content
