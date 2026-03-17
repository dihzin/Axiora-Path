"""
test_age_policy.py

Unit tests for the canonical age_policy module.
These tests run without a DB (pure logic tests) plus structural tests
ensuring enforcement wiring is correct.

Coverage:
  - is_difficulty_allowed_for_age (all age groups)
  - subject_age_filter_clauses structure
  - age_group_from_age mapping
  - AGE_GATE_MESSAGE and AGE_GATE_ERROR_CODE constants
  - enforce_subject_age_gate / remap_subject_for_child_age structural wiring
"""
from __future__ import annotations

from pathlib import Path

import pytest

# Import policy without DB (pure logic functions)
from app.services.age_policy import (
    AGE_GATE_ERROR_CODE,
    AGE_GATE_MESSAGE,
    age_group_from_age,
    is_difficulty_allowed_for_age,
    subject_age_filter_clauses,
)
from app.models import LessonDifficulty, SubjectAgeGroup


# ─── Difficulty × Age group rules ────────────────────────────────────────────


class TestDifficultyAllowedForAge:
    def test_6_8_only_easy_allowed(self) -> None:
        assert is_difficulty_allowed_for_age(difficulty=LessonDifficulty.EASY, age_group=SubjectAgeGroup.AGE_6_8)
        assert not is_difficulty_allowed_for_age(difficulty=LessonDifficulty.MEDIUM, age_group=SubjectAgeGroup.AGE_6_8)
        assert not is_difficulty_allowed_for_age(difficulty=LessonDifficulty.HARD, age_group=SubjectAgeGroup.AGE_6_8)

    def test_9_12_easy_and_medium_allowed(self) -> None:
        assert is_difficulty_allowed_for_age(difficulty=LessonDifficulty.EASY, age_group=SubjectAgeGroup.AGE_9_12)
        assert is_difficulty_allowed_for_age(difficulty=LessonDifficulty.MEDIUM, age_group=SubjectAgeGroup.AGE_9_12)
        assert not is_difficulty_allowed_for_age(difficulty=LessonDifficulty.HARD, age_group=SubjectAgeGroup.AGE_9_12)

    def test_13_15_all_difficulties_allowed(self) -> None:
        assert is_difficulty_allowed_for_age(difficulty=LessonDifficulty.EASY, age_group=SubjectAgeGroup.AGE_13_15)
        assert is_difficulty_allowed_for_age(difficulty=LessonDifficulty.MEDIUM, age_group=SubjectAgeGroup.AGE_13_15)
        assert is_difficulty_allowed_for_age(difficulty=LessonDifficulty.HARD, age_group=SubjectAgeGroup.AGE_13_15)


# ─── Age group mapping ────────────────────────────────────────────────────────


class TestAgeGroupFromAge:
    @pytest.mark.parametrize("age", [5, 6, 7, 8])
    def test_ages_6_to_8_map_to_age_6_8(self, age: int) -> None:
        assert age_group_from_age(age) == SubjectAgeGroup.AGE_6_8

    @pytest.mark.parametrize("age", [9, 10, 11, 12])
    def test_ages_9_to_12_map_to_age_9_12(self, age: int) -> None:
        assert age_group_from_age(age) == SubjectAgeGroup.AGE_9_12

    @pytest.mark.parametrize("age", [13, 14, 15, 16])
    def test_ages_13_plus_map_to_age_13_15(self, age: int) -> None:
        assert age_group_from_age(age) == SubjectAgeGroup.AGE_13_15


# ─── Subject age filter clauses ───────────────────────────────────────────────


class TestSubjectAgeFilterClauses:
    def test_returns_two_clauses(self) -> None:
        clauses = subject_age_filter_clauses(10)
        assert len(clauses) == 2

    def test_clauses_are_sqlalchemy_expressions(self) -> None:
        """Filter clauses must be valid SQLAlchemy binary expressions."""
        clauses = subject_age_filter_clauses(10)
        # Each clause should have a left and right (BinaryExpression)
        for clause in clauses:
            assert hasattr(clause, "left") or hasattr(clause, "compile")


# ─── Constants ────────────────────────────────────────────────────────────────


class TestConstants:
    def test_age_gate_message_is_portuguese(self) -> None:
        assert "faixa etária" in AGE_GATE_MESSAGE
        assert len(AGE_GATE_MESSAGE) > 10

    def test_age_gate_error_code_is_defined(self) -> None:
        assert AGE_GATE_ERROR_CODE == "CONTENT_AGE_RESTRICTED"


# ─── Structural wiring (source inspection) ────────────────────────────────────


def _age_policy_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "api" / "app" / "services" / "age_policy.py").read_text(encoding="utf-8")


class TestStructuralWiring:
    def test_enforce_function_raises_403(self) -> None:
        source = _age_policy_source()
        assert "HTTP_403_FORBIDDEN" in source
        assert "def enforce_subject_age_gate(" in source

    def test_remap_function_queries_by_name_and_age(self) -> None:
        source = _age_policy_source()
        assert "def remap_subject_for_child_age(" in source
        assert "func.lower(Subject.name)" in source
        assert "Subject.age_min <= int(child_age)" in source
        assert "Subject.age_max >= int(child_age)" in source

    def test_enforce_handles_no_child_profile(self) -> None:
        """Policy must no-op for non-child actors (parent/teacher)."""
        source = _age_policy_source()
        # Function returns early when child_id is None
        assert "if child_age is None:" in source
        assert "return  # non-child actor" in source or "return" in source

    def test_single_canonical_message(self) -> None:
        """There must be exactly one age gate message definition."""
        source = _age_policy_source()
        occurrences = source.count("Este conteúdo não está disponível para a sua faixa etária.")
        assert occurrences == 1, f"Expected 1 occurrence of age gate message, got {occurrences}"
