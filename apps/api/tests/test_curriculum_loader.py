from __future__ import annotations

from pathlib import Path

import pytest

from app.services.curriculum_loader import CurriculumLoader, CurriculumValidationError


def test_curriculum_loader_exposes_subjects_skills_and_lessons() -> None:
    loader = CurriculumLoader()

    subjects = loader.get_subjects()

    assert subjects == [
        "english",
        "finance",
        "geography",
        "history",
        "logic",
        "math",
        "portuguese",
        "science",
    ]
    assert loader.get_skills("math") == ["addition", "subtraction", "multiplication"]
    assert loader.get_lessons("addition") == [
        "addition_intro",
        "addition_practice",
        "addition_mastery",
    ]


def test_curriculum_loader_rejects_unknown_subject_and_skill() -> None:
    loader = CurriculumLoader()

    with pytest.raises(CurriculumValidationError, match="Unknown subject"):
        loader.get_skills("arts")

    with pytest.raises(CurriculumValidationError, match="Unknown skill"):
        loader.get_lessons("creative_writing")


def test_curriculum_loader_validates_lesson_order(tmp_path: Path) -> None:
    subject_file = tmp_path / "math.yaml"
    subject_file.write_text(
        "\n".join(
            [
                "subject: math",
                "age_groups:",
                "  - \"6_8\"",
                "skills:",
                "  addition:",
                "    subskills:",
                "      - single_digit",
                "    lessons:",
                "      - addition_intro",
                "      - addition_mastery",
                "    difficulty_progression:",
                "      - easy",
                "lesson_order:",
                "  - addition_mastery",
                "  - addition_intro",
            ]
        ),
        encoding="utf-8",
    )

    with pytest.raises(
        CurriculumValidationError,
        match="lesson_order must list every lesson exactly once in canonical order",
    ):
        CurriculumLoader(curriculum_dir=tmp_path)


def test_curriculum_loader_rejects_duplicate_skill_ids_across_subjects(tmp_path: Path) -> None:
    first = tmp_path / "math.yaml"
    second = tmp_path / "science.yaml"
    template = "\n".join(
            [
                "subject: {subject}",
                "age_groups:",
                "  - \"6_8\"",
            "skills:",
            "  shared_skill:",
            "    subskills:",
            "      - basics",
            "    lessons:",
            "      - {lesson}",
            "    difficulty_progression:",
            "      - easy",
            "lesson_order:",
            "  - {lesson}",
        ]
    )
    first.write_text(template.format(subject="math", lesson="math_lesson"), encoding="utf-8")
    second.write_text(template.format(subject="science", lesson="science_lesson"), encoding="utf-8")

    with pytest.raises(CurriculumValidationError, match="Duplicate skill identifier across subjects"):
        CurriculumLoader(curriculum_dir=tmp_path)
