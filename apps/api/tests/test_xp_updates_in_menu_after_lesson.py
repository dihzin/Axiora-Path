from __future__ import annotations

from pathlib import Path


def _lesson_page_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "web" / "app" / "child" / "aprender" / "lesson" / "[id]" / "page.tsx").read_text(
        encoding="utf-8"
    )


def _trail_screen_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "web" / "components" / "trail" / "TrailScreen.tsx").read_text(encoding="utf-8")


def _api_client_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "web" / "lib" / "api" / "client.ts").read_text(encoding="utf-8")


def test_xp_updates_in_menu_after_lesson() -> None:
    lesson = _lesson_page_source()
    trail = _trail_screen_source()
    client = _api_client_source()

    assert "params.set(\"profileXp\", String(Math.floor(profileXp)));" in lesson
    assert "params.set(\"profileXpPercent\", String(resolveXpLevelPercentFromProfileXp(profileXp)));" in lesson
    assert "params.set(\"profileCoins\", String(Math.floor(profileCoins)));" in lesson

    assert "const profileXpFromQuery = useMemo(() => {" in trail
    assert "const profileCoinsFromQuery = useMemo(() => {" in trail
    assert "const profileXpPercentFromQuery = useMemo(() => {" in trail
    assert "completedLessonSignal.length > 0" in trail
    assert "void getAprenderLearningProfile(cacheBuster ? { cacheBuster } : undefined)" in trail

    assert "getAprenderLearningProfile(params?: { cacheBuster?: string | number })" in client
    assert "query.set(\"t\", String(params.cacheBuster));" in client
