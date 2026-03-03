from __future__ import annotations

from pathlib import Path


def _learning_route_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "api" / "app" / "api" / "routes" / "learning.py").read_text(encoding="utf-8")


def test_learning_path_remaps_subject_id_to_child_age_range() -> None:
    source = _learning_route_source()

    assert "def _remap_subject_id_for_child_age(" in source
    assert "func.lower(Subject.name) == str(requested_subject.name).lower()" in source
    assert "Subject.age_min <= int(child_age)" in source
    assert "Subject.age_max >= int(child_age)" in source
    assert "effective_subject_id = _remap_subject_id_for_child_age(" in source
