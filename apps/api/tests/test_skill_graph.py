from __future__ import annotations

from app.services.skill_graph import (
    StudentState,
    build_graph,
    get_lessons_for_skill,
    get_prerequisite_skills,
)


def test_build_graph_creates_curriculum_skill_nodes() -> None:
    graph = build_graph()

    node = graph.get_node("addition")

    assert node.subject == "math"
    assert node.subskill == ("single_digit", "double_digit", "word_problems")
    assert node.lessons == ("addition_intro", "addition_practice", "addition_mastery")
    assert node.prerequisites == ()


def test_get_prerequisite_skills_returns_transitive_chain() -> None:
    prerequisites = get_prerequisite_skills("multiplication")

    assert prerequisites == ["addition", "subtraction"]


def test_get_lessons_for_skill_returns_curriculum_lessons() -> None:
    assert get_lessons_for_skill("grammar_basics") == [
        "grammar_intro",
        "grammar_practice",
        "grammar_mastery",
    ]


def test_get_next_skill_prioritizes_remediation_before_advancement() -> None:
    graph = build_graph()

    next_skill = graph.get_next_skill(
        StudentState(
            age_group="9-12",
            difficulty="easy",
            subject="math",
            mastery={
                "addition": 0.25,
            },
        )
    )

    assert next_skill is not None
    assert next_skill.id == "addition"


def test_get_next_skill_unlocks_next_skill_when_prerequisite_mastered() -> None:
    graph = build_graph()

    next_skill = graph.get_next_skill(
        {
            "age_group": "9-12",
            "difficulty": "medium",
            "subject": "math",
            "mastery": {
                "addition": 0.8,
            },
        }
    )

    assert next_skill is not None
    assert next_skill.id == "subtraction"


def test_get_next_skill_respects_age_group_and_difficulty_preferences() -> None:
    graph = build_graph()

    next_skill = graph.get_next_skill(
        StudentState(
            age_group="13-15",
            difficulty="hard",
            subject="science",
            mastery={
                "living_things": 1.0,
                "matter_and_materials": 0.85,
            },
        )
    )

    assert next_skill is not None
    assert next_skill.id == "earth_and_space"
