from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


class CurriculumValidationError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class SkillDefinition:
    subskills: tuple[str, ...]
    lessons: tuple[str, ...]
    difficulty_progression: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class SubjectDefinition:
    subject: str
    age_groups: tuple[str, ...]
    skills: dict[str, SkillDefinition]
    lesson_order: tuple[str, ...]


class CurriculumLoader:
    _REQUIRED_SKILL_KEYS = {"subskills", "lessons", "difficulty_progression"}
    _ALLOWED_AGE_GROUPS = {"6_8", "9_11", "12_14"}
    _ALLOWED_DIFFICULTIES = {"easy", "medium", "hard"}

    def __init__(self, curriculum_dir: Path | None = None) -> None:
        base_dir = curriculum_dir or Path(__file__).resolve().parents[1] / "curriculum" / "subjects"
        self._curriculum_dir = base_dir
        self._subjects = self._load_curriculum()
        self._skills_index = self._build_skills_index(self._subjects)

    def get_subjects(self) -> list[str]:
        return list(self._subjects.keys())

    def get_curriculum(self) -> dict[str, SubjectDefinition]:
        return dict(self._subjects)

    def get_skills(self, subject: str) -> list[str]:
        normalized_subject = subject.strip().lower()
        if normalized_subject not in self._subjects:
            raise CurriculumValidationError(f"Unknown subject: {subject}")
        return list(self._subjects[normalized_subject].skills.keys())

    def get_lessons(self, skill: str) -> list[str]:
        normalized_skill = skill.strip().lower()
        if normalized_skill not in self._skills_index:
            raise CurriculumValidationError(f"Unknown skill: {skill}")
        return list(self._skills_index[normalized_skill].lessons)

    def _load_curriculum(self) -> dict[str, SubjectDefinition]:
        if not self._curriculum_dir.exists():
            raise CurriculumValidationError(
                f"Curriculum directory not found: {self._curriculum_dir}"
            )

        subjects: dict[str, SubjectDefinition] = {}
        for path in sorted(self._curriculum_dir.glob("*.yaml")):
            if path.name == "__init__.py":
                continue
            subject_def = self._load_subject_file(path)
            if subject_def.subject in subjects:
                raise CurriculumValidationError(
                    f"Duplicate subject identifier found: {subject_def.subject}"
                )
            subjects[subject_def.subject] = subject_def

        if not subjects:
            raise CurriculumValidationError("No curriculum subject files were found")
        return subjects

    def _load_subject_file(self, path: Path) -> SubjectDefinition:
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(loaded, dict):
            raise CurriculumValidationError(f"{path.name}: file must contain a mapping")

        subject = self._require_string(loaded.get("subject"), path, "subject")
        expected_subject = path.stem.lower()
        if subject != expected_subject:
            raise CurriculumValidationError(
                f"{path.name}: subject must match filename stem '{expected_subject}'"
            )

        age_groups = self._require_string_list(loaded.get("age_groups"), path, "age_groups")
        invalid_age_groups = [value for value in age_groups if value not in self._ALLOWED_AGE_GROUPS]
        if invalid_age_groups:
            raise CurriculumValidationError(
                f"{path.name}: invalid age_groups: {', '.join(invalid_age_groups)}"
            )

        raw_skills = loaded.get("skills")
        if not isinstance(raw_skills, dict) or not raw_skills:
            raise CurriculumValidationError(f"{path.name}: skills must be a non-empty mapping")

        skills: dict[str, SkillDefinition] = {}
        all_lessons: list[str] = []
        for skill_name, skill_payload in raw_skills.items():
            normalized_skill = self._require_string(skill_name, path, "skills key")
            if normalized_skill in skills:
                raise CurriculumValidationError(f"{path.name}: duplicate skill '{normalized_skill}'")
            skills[normalized_skill] = self._parse_skill_definition(
                path=path,
                skill_name=normalized_skill,
                payload=skill_payload,
            )
            all_lessons.extend(skills[normalized_skill].lessons)

        if len(set(all_lessons)) != len(all_lessons):
            raise CurriculumValidationError(f"{path.name}: lesson identifiers must be unique within subject")

        lesson_order = self._require_string_list(loaded.get("lesson_order"), path, "lesson_order")
        if tuple(lesson_order) != tuple(all_lessons):
            raise CurriculumValidationError(
                f"{path.name}: lesson_order must list every lesson exactly once in canonical order"
            )

        return SubjectDefinition(
            subject=subject,
            age_groups=tuple(age_groups),
            skills=skills,
            lesson_order=tuple(lesson_order),
        )

    def _parse_skill_definition(
        self,
        *,
        path: Path,
        skill_name: str,
        payload: Any,
    ) -> SkillDefinition:
        if not isinstance(payload, dict):
            raise CurriculumValidationError(f"{path.name}: skill '{skill_name}' must be a mapping")

        missing_keys = self._REQUIRED_SKILL_KEYS - set(payload.keys())
        if missing_keys:
            missing = ", ".join(sorted(missing_keys))
            raise CurriculumValidationError(f"{path.name}: skill '{skill_name}' missing keys: {missing}")

        subskills = self._require_string_list(payload.get("subskills"), path, f"{skill_name}.subskills")
        lessons = self._require_string_list(payload.get("lessons"), path, f"{skill_name}.lessons")
        difficulty_progression = self._require_string_list(
            payload.get("difficulty_progression"),
            path,
            f"{skill_name}.difficulty_progression",
        )
        invalid_difficulties = [
            value for value in difficulty_progression if value not in self._ALLOWED_DIFFICULTIES
        ]
        if invalid_difficulties:
            raise CurriculumValidationError(
                f"{path.name}: skill '{skill_name}' has invalid difficulties: "
                f"{', '.join(invalid_difficulties)}"
            )
        if len(set(subskills)) != len(subskills):
            raise CurriculumValidationError(
                f"{path.name}: skill '{skill_name}' subskills must be unique"
            )
        if len(set(lessons)) != len(lessons):
            raise CurriculumValidationError(
                f"{path.name}: skill '{skill_name}' lessons must be unique"
            )

        return SkillDefinition(
            subskills=tuple(subskills),
            lessons=tuple(lessons),
            difficulty_progression=tuple(difficulty_progression),
        )

    def _build_skills_index(
        self,
        subjects: dict[str, SubjectDefinition],
    ) -> dict[str, SkillDefinition]:
        skill_index: dict[str, SkillDefinition] = {}
        for subject in subjects.values():
            for skill_name, skill_def in subject.skills.items():
                if skill_name in skill_index:
                    raise CurriculumValidationError(
                        f"Duplicate skill identifier across subjects: {skill_name}"
                    )
                skill_index[skill_name] = skill_def
        return skill_index

    @staticmethod
    def _require_string(value: Any, path: Path, field_name: str) -> str:
        if not isinstance(value, str) or not value.strip():
            raise CurriculumValidationError(f"{path.name}: {field_name} must be a non-empty string")
        return value.strip().lower()

    @classmethod
    def _require_string_list(cls, value: Any, path: Path, field_name: str) -> list[str]:
        if not isinstance(value, list) or not value:
            raise CurriculumValidationError(f"{path.name}: {field_name} must be a non-empty list")
        normalized: list[str] = []
        for item in value:
            normalized.append(cls._require_string(item, path, field_name))
        return normalized
