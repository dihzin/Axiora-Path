from __future__ import annotations

from pathlib import Path


def _age_policy_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "api" / "app" / "services" / "age_policy.py").read_text(encoding="utf-8")


def _learning_route_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "api" / "app" / "api" / "routes" / "learning.py").read_text(encoding="utf-8")


def test_age_gate_policy_module_exists_and_is_canonical() -> None:
    """Verify the canonical age gate lives in age_policy.py (Wave 1 refactor)."""
    source = _age_policy_source()

    # Canonical enforcement function exists
    assert "def enforce_subject_age_gate(" in source

    # Uses get_child_age for computation
    assert "get_child_age" in source

    # Checks both lower and upper age bounds
    assert "subject.age_min" in source
    assert "subject.age_max" in source

    # Raises HTTP 403
    assert "HTTP_403_FORBIDDEN" in source

    # Uses unified Portuguese message
    assert "Este conteúdo não está disponível para a sua faixa etária." in source

    # Error code is exported for frontends
    assert "AGE_GATE_ERROR_CODE" in source


def test_learning_route_delegates_to_age_policy() -> None:
    """Verify learning.py no longer has inline age gate — delegates to age_policy."""
    source = _learning_route_source()

    # Old private functions must NOT exist (removed in Wave 1 refactor)
    assert "_ensure_subject_allowed_for_child_age(" not in source
    assert "def _ensure_subject_allowed_for_child_age(" not in source

    # Must import and call canonical policy module
    assert "from app.services.age_policy import" in source
    assert "enforce_subject_age_gate(" in source
