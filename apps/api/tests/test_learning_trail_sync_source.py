from __future__ import annotations

from pathlib import Path


def test_lesson_result_url_includes_completion_timestamp() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root / "apps" / "web" / "app" / "(app)" / "child" / "aprender" / "lesson" / "[id]" / "page.tsx"
    ).read_text(encoding="utf-8")

    assert 'params.set("completedAt", payload.endedAt ?? new Date().toISOString());' in source


def test_trail_data_refreshes_from_completion_signal_and_refetches_missions() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "apps" / "web" / "hooks" / "useTrailData.ts").read_text(encoding="utf-8")

    assert 'const completedAt = searchParams.get("completedAt") ?? "";' in source
    assert "}, [selectedSubjectId, completedLessonSignal]);" in source
    assert 'const profileXpFromQuery = Number(searchParams.get("profileXp"));' in source
