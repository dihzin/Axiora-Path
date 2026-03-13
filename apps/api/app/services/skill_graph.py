from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.core.config import settings
from app.services.curriculum_loader import CurriculumLoader, SkillDefinition, SubjectDefinition


_AGE_GROUP_ALIASES = {
    "6_8": "6_8",
    "6-8": "6_8",
    "age_6_8": "6_8",
    "9_11": "9_11",
    "9-11": "9_11",
    "9_12": "9_11",
    "9-12": "9_11",
    "age_9_11": "9_11",
    "age_9_12": "9_11",
    "12_14": "12_14",
    "12-14": "12_14",
    "13_15": "12_14",
    "13-15": "12_14",
    "age_12_14": "12_14",
    "age_13_15": "12_14",
}

_DIFFICULTY_ORDER = {"easy": 0, "medium": 1, "hard": 2}


@dataclass(frozen=True, slots=True)
class SkillNode:
    id: str
    subject: str
    skill: str
    subskill: tuple[str, ...]
    lessons: tuple[str, ...]
    prerequisites: tuple[str, ...]
    age_groups: tuple[str, ...]
    difficulty_progression: tuple[str, ...]
    lesson_order_index: int


@dataclass(frozen=True, slots=True)
class StudentState:
    age_group: str
    mastery: dict[str, float]
    difficulty: str = "medium"
    subject: str | None = None


class SkillGraph:
    def __init__(self, nodes: dict[str, SkillNode]) -> None:
        self._nodes = nodes

    @property
    def nodes(self) -> dict[str, SkillNode]:
        return dict(self._nodes)

    def get_node(self, skill: str) -> SkillNode:
        normalized_skill = _normalize_token(skill)
        try:
            return self._nodes[normalized_skill]
        except KeyError as exc:
            raise ValueError(f"Unknown skill: {skill}") from exc

    def get_prerequisite_skills(self, skill: str) -> list[str]:
        node = self.get_node(skill)
        ordered: list[str] = []
        seen: set[str] = set()

        def _visit(skill_id: str) -> None:
            if skill_id in seen:
                return
            seen.add(skill_id)
            for prerequisite in self._nodes[skill_id].prerequisites:
                _visit(prerequisite)
                if prerequisite not in ordered:
                    ordered.append(prerequisite)

        _visit(node.id)
        return ordered

    def get_lessons_for_skill(self, skill: str) -> list[str]:
        return list(self.get_node(skill).lessons)

    def get_next_skill(self, student_state: StudentState | dict[str, Any]) -> SkillNode | None:
        state = _coerce_student_state(student_state)
        target_age_group = _normalize_age_group(state.age_group)
        target_difficulty = _normalize_difficulty(state.difficulty)
        mastery_map = {
            _normalize_token(skill): _clamp_mastery(score)
            for skill, score in state.mastery.items()
        }
        threshold = float(settings.axion_prerequisite_mastery_threshold)

        candidates: list[tuple[float, int, str, SkillNode]] = []
        for node in self._nodes.values():
            if state.subject is not None and node.subject != _normalize_token(state.subject):
                continue
            if target_age_group not in node.age_groups:
                continue

            node_mastery = mastery_map.get(node.id, 0.0)
            prerequisites_met = all(
                mastery_map.get(prerequisite, 0.0) >= threshold for prerequisite in node.prerequisites
            )
            if not prerequisites_met:
                continue
            if node_mastery >= 0.999:
                continue

            progression_target = _recommended_difficulty(node, node_mastery)
            difficulty_gap = abs(
                _DIFFICULTY_ORDER[progression_target] - _DIFFICULTY_ORDER[target_difficulty]
            )
            novelty_bonus = 0.35 if node.id not in mastery_map else 0.0
            remediation_bonus = (1.0 - node_mastery) if node_mastery < threshold else 0.0
            advancement_bonus = node_mastery if node_mastery >= threshold else 0.0
            score = remediation_bonus + novelty_bonus + advancement_bonus - (difficulty_gap * 0.2)
            candidates.append((score, node.lesson_order_index, node.id, node))

        if not candidates:
            return None

        candidates.sort(key=lambda item: (-item[0], item[1], item[2]))
        return candidates[0][3]


def build_graph(loader: CurriculumLoader | None = None) -> SkillGraph:
    return _build_graph_cached() if loader is None else _build_graph(loader)


def get_next_skill(student_state: StudentState | dict[str, Any]) -> SkillNode | None:
    return build_graph().get_next_skill(student_state)


def get_prerequisite_skills(skill: str) -> list[str]:
    return build_graph().get_prerequisite_skills(skill)


def get_lessons_for_skill(skill: str) -> list[str]:
    return build_graph().get_lessons_for_skill(skill)


@lru_cache(maxsize=1)
def _build_graph_cached() -> SkillGraph:
    return _build_graph(CurriculumLoader())


def _build_graph(loader: CurriculumLoader) -> SkillGraph:
    curriculum = loader.get_curriculum()
    nodes: dict[str, SkillNode] = {}
    for subject_name, subject_definition in curriculum.items():
        nodes.update(_build_subject_nodes(subject_name, subject_definition))
    return SkillGraph(nodes)


def _build_subject_nodes(
    subject_name: str,
    subject_definition: SubjectDefinition,
) -> dict[str, SkillNode]:
    lesson_positions = {lesson: index for index, lesson in enumerate(subject_definition.lesson_order)}
    skill_names = list(subject_definition.skills.keys())
    subject_nodes: dict[str, SkillNode] = {}
    previous_skill: str | None = None

    for skill_name in skill_names:
        skill_definition = subject_definition.skills[skill_name]
        first_lesson = skill_definition.lessons[0]
        prerequisites = () if previous_skill is None else (previous_skill,)
        subject_nodes[skill_name] = SkillNode(
            id=skill_name,
            subject=subject_name,
            skill=skill_name,
            subskill=tuple(skill_definition.subskills),
            lessons=tuple(skill_definition.lessons),
            prerequisites=prerequisites,
            age_groups=tuple(subject_definition.age_groups),
            difficulty_progression=tuple(skill_definition.difficulty_progression),
            lesson_order_index=lesson_positions[first_lesson],
        )
        previous_skill = skill_name

    return subject_nodes


def _coerce_student_state(student_state: StudentState | dict[str, Any]) -> StudentState:
    if isinstance(student_state, StudentState):
        return student_state
    if not isinstance(student_state, dict):
        raise ValueError("student_state must be a StudentState or mapping")

    mastery_raw = student_state.get("mastery", {})
    if not isinstance(mastery_raw, dict):
        raise ValueError("student_state.mastery must be a mapping")

    return StudentState(
        age_group=str(student_state.get("age_group") or student_state.get("ageGroup") or "").strip(),
        mastery={str(key): float(value) for key, value in mastery_raw.items()},
        difficulty=str(student_state.get("difficulty") or "medium").strip(),
        subject=(
            None
            if student_state.get("subject") is None
            else str(student_state.get("subject")).strip()
        ),
    )


def _recommended_difficulty(node: SkillNode, mastery: float) -> str:
    progression = list(node.difficulty_progression)
    if mastery < 0.35:
        return progression[0]
    if mastery < 0.70:
        return progression[min(1, len(progression) - 1)]
    return progression[-1]


def _normalize_token(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if not normalized:
        raise ValueError("value must be a non-empty string")
    return normalized


def _normalize_age_group(value: str) -> str:
    normalized = _normalize_token(value)
    try:
        return _AGE_GROUP_ALIASES[normalized]
    except KeyError as exc:
        raise ValueError(f"Unsupported age_group: {value}") from exc


def _normalize_difficulty(value: str) -> str:
    normalized = _normalize_token(value)
    if normalized not in _DIFFICULTY_ORDER:
        raise ValueError(f"Unsupported difficulty: {value}")
    return normalized


def _clamp_mastery(value: float) -> float:
    return max(0.0, min(1.0, float(value)))
