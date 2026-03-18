from __future__ import annotations

from pathlib import Path


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_learning_runtime_routes_require_child_context() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = _read(repo_root / "apps" / "api" / "app" / "api" / "routes" / "learning.py")

    assert "resolve_child_context(" in source
    assert 'Query(alias="childId")' in source
    assert "requested_child_id=child_id" in source
    assert "requested_child_id=payload.child_id" in source
    assert "child_id=active_child.id" in source


def test_learning_path_builder_no_longer_unlocks_every_lesson() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = _read(repo_root / "apps" / "api" / "app" / "services" / "learning_path_events.py")

    assert "lesson_unlocked =" in source
    assert "previous_lesson_completed" in source
    assert "unlocked=True" not in source


def test_lesson_frontend_sends_child_context_to_learning_api() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    lesson_page = _read(repo_root / "apps" / "web" / "app" / "(app)" / "child" / "aprender" / "lesson" / "[id]" / "page.tsx")
    client = _read(repo_root / "apps" / "web" / "lib" / "api" / "client.ts")

    assert "function readActiveChildId(): number | null" in lesson_page
    assert "childId: readActiveChildId() ?? undefined" in lesson_page
    assert "export async function getLearningPath(subjectId?: number, childId?: number)" in client
    assert "query.set(\"childId\", String(childId));" in client


def test_learning_path_route_distinguishes_age_without_curriculum_from_missing_seed() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = _read(repo_root / "apps" / "api" / "app" / "api" / "routes" / "learning.py")

    assert "def _has_playable_content_for_child_age" in source
    assert "def _learning_unavailable_detail_for_child_age" in source
    assert "O currículo atual começa aos 6 anos." in source
