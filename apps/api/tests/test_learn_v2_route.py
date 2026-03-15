from __future__ import annotations

from pathlib import Path


def test_learn_v2_route_uses_required_engines() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "apps" / "api" / "app" / "api" / "routes" / "learn_v2.py").read_text(
        encoding="utf-8"
    )

    assert "CurriculumLoader" in source
    assert "SkillGraph" in source
    assert "LessonEngine" in source
    assert "AxionLearningEngine" in source
    assert 'prefix="/learn"' in source
    assert '"/subjects"' in source
    assert '"/skills"' in source
    assert '"/lesson/start"' in source
    assert '"/lesson/complete"' in source
    assert '"/next"' in source
    assert "xpReward" in source
    assert "nextRecommendation" in source
    assert "skillGraph" in source
    assert "prerequisiteMasteryThreshold" in source


def test_main_registers_learn_v2_router() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "apps" / "api" / "app" / "main.py").read_text(encoding="utf-8")

    assert "from app.api.routes.learn_v2 import router as learn_v2_router" in source
    assert "app.include_router(learn_v2_router)" in source
