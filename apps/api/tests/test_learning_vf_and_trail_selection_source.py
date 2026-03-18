from __future__ import annotations

from pathlib import Path


def test_math_seed_true_false_uses_numeric_comparison() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "apps" / "api" / "scripts" / "seed_question_bank_math_portuguese.py").read_text(
        encoding="utf-8"
    )

    assert '"correctOptionId": "true" if left < right else "false"' in source


def test_trail_hero_card_prefers_current_node_after_completion() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "apps" / "web" / "components" / "trail" / "TrailScreen.tsx").read_text(
        encoding="utf-8"
    )

    assert "completedLessonSignal," in source
    assert "if (selectedNode && selectedNode.status !== \"done\") return selectedNode;" in source
    assert "if (!completedLessonSignal) return;" in source
    assert 'if (!node || node.status === "locked" || node.status === "done") return;' in source
    assert 'if (state === "locked" || state === "future" || state === "completed") return;' in source
