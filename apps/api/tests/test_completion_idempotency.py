"""
test_completion_idempotency.py

Regression tests for double-completion / double-reward prevention.

Verifies structural contracts that prevent the dual-write bug documented in
ARCHITECTURE_RISKS.md #3 (same user action touching both
/api/learning/session/finish AND /api/aprender/lessons/{id}/complete).

Wave 2 fix: finish_session now internally calls complete_lesson with
grant_economy_rewards=False, making the aprender endpoint call from
the frontend redundant and safe to remove.
"""
from __future__ import annotations

from pathlib import Path


def _learning_route_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "api" / "app" / "api" / "routes" / "learning.py").read_text(encoding="utf-8")


def _aprender_route_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "api" / "app" / "api" / "routes" / "aprender.py").read_text(encoding="utf-8")


def _lesson_page_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    path = (
        repo_root
        / "apps"
        / "web"
        / "app"
        / "(app)"
        / "child"
        / "aprender"
        / "lesson"
        / "[id]"
        / "page.tsx"
    )
    return path.read_text(encoding="utf-8")


class TestFinishSessionAbsorbsLessonCompletion:
    """finish_session must internally update LessonProgress without double-rewarding."""

    def test_finish_session_imports_complete_lesson(self) -> None:
        source = _learning_route_source()
        assert "_complete_lesson_progress" in source
        assert "from app.services.aprender import" in source

    def test_finish_session_calls_complete_lesson_with_no_economy_rewards(self) -> None:
        source = _learning_route_source()
        # Must call with grant_economy_rewards=False to prevent double XP/coins
        assert "grant_economy_rewards=False" in source

    def test_finish_session_handles_locked_lesson_gracefully(self) -> None:
        """Progress update errors must not fail the session finish."""
        source = _learning_route_source()
        assert "LessonLockedError" in source
        assert "LessonNotFoundError" in source
        # Errors logged but not re-raised
        assert "logger.warning" in source or "logger.error" in source

    def test_finish_session_logs_progress_update(self) -> None:
        source = _learning_route_source()
        assert "learning_session_lesson_progress_updated" in source


class TestAprenderCompleteEndpointDeprecated:
    """The aprender lesson complete endpoint must emit deprecation signals."""

    def test_complete_endpoint_has_deprecation_header(self) -> None:
        source = _aprender_route_source()
        assert 'response.headers["Deprecation"] = "true"' in source

    def test_complete_endpoint_has_sunset_header(self) -> None:
        source = _aprender_route_source()
        assert 'response.headers["Sunset"]' in source

    def test_complete_endpoint_has_link_to_successor(self) -> None:
        source = _aprender_route_source()
        assert "successor-version" in source
        assert "/api/learning/session/finish" in source


class TestLearnV2RouterDeprecated:
    """learn_v2 router must carry deprecation signals on all responses."""

    def test_learn_v2_has_deprecation_headers(self) -> None:
        repo_root = Path(__file__).resolve().parents[3]
        source = (repo_root / "apps" / "api" / "app" / "api" / "routes" / "learn_v2.py").read_text(encoding="utf-8")
        assert "_DEPRECATION_HEADERS" in source
        assert '"Deprecation": "true"' in source
        assert '"Sunset"' in source
        assert "dependencies=[Depends(_deprecation_response)]" in source


class TestSingleCompletionContract:
    """
    Structural test: the finish_session route must be the single point that
    triggers both session closure AND lesson progress — not two separate calls.
    """

    def test_finish_session_handles_both_session_and_lesson(self) -> None:
        source = _learning_route_source()
        # Session close via adaptive engine
        assert "finish_adaptive_learning_session(" in source
        # Lesson progress via aprender service (internally)
        assert "_complete_lesson_progress(" in source
        # Both in the same route handler
        finish_idx = source.find("def finish_session(")
        next_route_idx = source.find("\n@router.", finish_idx + 1)
        if next_route_idx == -1:
            finish_body = source[finish_idx:]
        else:
            finish_body = source[finish_idx:next_route_idx]
        assert "finish_adaptive_learning_session(" in finish_body
        assert "_complete_lesson_progress(" in finish_body
