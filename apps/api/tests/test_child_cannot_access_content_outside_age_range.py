from __future__ import annotations

from pathlib import Path


def _learning_route_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "api" / "app" / "api" / "routes" / "learning.py").read_text(encoding="utf-8")


def test_child_cannot_access_content_outside_age_range() -> None:
    source = _learning_route_source()

    assert "def _ensure_subject_allowed_for_child_age(" in source
    assert "get_child_age(child.date_of_birth, today=date.today())" in source
    assert "int(child_age) < int(subject.age_min) or int(child_age) > int(subject.age_max)" in source
    assert "Este conteúdo não está disponível para a sua faixa etária." in source
    assert "_ensure_subject_allowed_for_child_age(" in source
