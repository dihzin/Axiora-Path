from __future__ import annotations

from pathlib import Path


def _lesson_page_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "web" / "app" / "child" / "aprender" / "lesson" / "[id]" / "page.tsx").read_text(
        encoding="utf-8"
    )


def _adaptive_service_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "api" / "app" / "services" / "adaptive_learning.py").read_text(encoding="utf-8")


def test_lesson_route_handles_empty_candidates_gracefully() -> None:
    lesson = _lesson_page_source()
    service = _adaptive_service_source()

    assert "applyEmptyBatchUnavailableState" in lesson
    assert "setContentUnavailableReason" in lesson
    assert "router.replace(`/child/aprender?subjectId=${fallbackSubjectId}`);" not in lesson
    assert "router.replace(\"/child/aprender\");" not in lesson
    assert "console.info(\"lesson_empty_candidates\"" in lesson
    assert "trackAprenderEvent(\"lesson_content_unavailable\"" in lesson

    assert "\"candidates_raw\"" in service
    assert "\"candidates_filtered\"" in service
    assert "\"fallback_reason\"" in service
    assert "\"block_reason\"" in service
    assert "learning_next_candidates_diagnostics" in service
