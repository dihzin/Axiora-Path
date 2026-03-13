from __future__ import annotations

from app.services.axion_learning_engine import AxionLearningEngine, LearningGap


def test_detect_learning_gap_returns_low_mastery_gap(monkeypatch) -> None:
    engine = AxionLearningEngine.__new__(AxionLearningEngine)
    engine.db = object()
    engine.graph = None
    engine.tenant_id = None

    monkeypatch.setattr(
        engine,
        "_weakest_skill_row",
        lambda **_kwargs: type(
            "WeakestRow",
            (),
            {
                "skill": "addition",
                "subject": "math",
                "mastery": 0.2,
                "confidence": 0.8,
                "velocity": 0.1,
            },
        )(),
    )
    monkeypatch.setattr(engine, "_recent_failed_attempts", lambda **_kwargs: 0)

    gap = engine.detect_learning_gap(student_id=1)

    assert gap is not None
    assert gap.skill == "addition"
    assert gap.subject == "math"
    assert gap.reason == "low_mastery"


def test_recommend_next_lesson_prioritizes_remediation(monkeypatch) -> None:
    engine = AxionLearningEngine.__new__(AxionLearningEngine)
    engine.db = object()
    engine.graph = type(
        "Graph",
        (),
        {
            "get_node": lambda _self, _skill: type(
                "Node",
                (),
                {"lessons": ("addition_intro", "addition_practice", "addition_mastery")},
            )(),
        },
    )()
    engine.tenant_id = None

    monkeypatch.setattr(
        engine,
        "detect_learning_gap",
        lambda _student_id: LearningGap(subject="math", skill="addition", reason="low_mastery", severity="high"),
    )
    monkeypatch.setattr(engine, "_load_mastery_map", lambda **_kwargs: {"addition": 0.2})
    monkeypatch.setattr(engine, "_resolve_age_group", lambda **_kwargs: "9-12")

    recommendation = engine.recommend_next_lesson(student_id=2)

    assert recommendation is not None
    assert recommendation.subject == "math"
    assert recommendation.skill == "addition"
    assert recommendation.lesson == "addition_intro"
    assert recommendation.reason == "remediation:low_mastery"


def test_schedule_review_uses_weakest_prerequisite(monkeypatch) -> None:
    engine = AxionLearningEngine.__new__(AxionLearningEngine)
    engine.db = object()
    engine.graph = type(
        "Graph",
        (),
        {
            "get_prerequisite_skills": lambda _self, _skill: ["addition"],
            "get_node": lambda _self, _skill: type(
                "Node",
                (),
                {"subject": "math", "id": "addition", "lessons": ("addition_intro", "addition_practice", "addition_mastery")},
            )(),
        },
    )()
    engine.tenant_id = None

    monkeypatch.setattr(
        engine,
        "_weakest_skill_row",
        lambda **_kwargs: type(
            "WeakestRow",
            (),
            {
                "skill": "subtraction",
                "subject": "math",
                "mastery": 0.5,
                "confidence": 0.5,
                "velocity": -0.1,
            },
        )(),
    )
    monkeypatch.setattr(engine, "_load_mastery_map", lambda **_kwargs: {"addition": 0.3, "subtraction": 0.5})
    monkeypatch.setattr(engine, "_resolve_age_group", lambda **_kwargs: "9-12")
    monkeypatch.setattr(engine, "_recent_failed_attempts", lambda **_kwargs: 2)

    recommendation = engine.schedule_review(student_id=3)

    assert recommendation is not None
    assert recommendation.skill == "addition"
    assert recommendation.lesson == "addition_intro"
    assert recommendation.reason == "review_scheduled"


def test_recommend_next_lesson_uses_graph_progression_when_no_gap_or_review(monkeypatch) -> None:
    engine = AxionLearningEngine.__new__(AxionLearningEngine)
    engine.db = object()
    engine.graph = type(
        "Graph",
        (),
        {
            "get_next_skill": lambda _self, _state: type(
                "Node",
                (),
                {
                    "subject": "science",
                    "id": "matter_and_materials",
                    "lessons": ("matter_intro", "matter_practice", "matter_mastery"),
                },
            )(),
        },
    )()
    engine.tenant_id = None

    monkeypatch.setattr(engine, "detect_learning_gap", lambda _student_id: None)
    monkeypatch.setattr(engine, "schedule_review", lambda _student_id: None)
    monkeypatch.setattr(engine, "_load_mastery_map", lambda **_kwargs: {"living_things": 0.8})
    monkeypatch.setattr(engine, "_resolve_target_subject", lambda **_kwargs: "science")
    monkeypatch.setattr(engine, "_resolve_age_group", lambda **_kwargs: "13-15")
    monkeypatch.setattr(engine, "_resolve_preferred_difficulty", lambda _mastery_map: "hard")

    recommendation = engine.recommend_next_lesson(student_id=4)

    assert recommendation is not None
    assert recommendation.subject == "science"
    assert recommendation.skill == "matter_and_materials"
    assert recommendation.lesson == "matter_intro"
    assert recommendation.reason == "next_skill_progression"
