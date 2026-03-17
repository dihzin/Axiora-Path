from __future__ import annotations

from pathlib import Path


def _age_policy_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "api" / "app" / "services" / "age_policy.py").read_text(encoding="utf-8")


def _learning_route_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "api" / "app" / "api" / "routes" / "learning.py").read_text(encoding="utf-8")


def test_subject_remap_logic_lives_in_age_policy() -> None:
    """Verify subject-to-age-range remapping is canonical in age_policy.py (Wave 1)."""
    source = _age_policy_source()

    # Canonical remap function exists
    assert "def remap_subject_for_child_age(" in source

    # Queries same-name subjects within age bounds
    assert "func.lower(Subject.name)" in source
    assert "Subject.age_min <= int(child_age)" in source
    assert "Subject.age_max >= int(child_age)" in source


def test_learning_route_delegates_remap_to_age_policy() -> None:
    """Verify learning.py delegates subject remapping to age_policy (Wave 1)."""
    source = _learning_route_source()

    # Old private function must NOT exist
    assert "def _remap_subject_id_for_child_age(" not in source

    # Must call the canonical policy function
    assert "remap_subject_for_child_age(" in source

    # Import must be from age_policy
    assert "from app.services.age_policy import" in source
