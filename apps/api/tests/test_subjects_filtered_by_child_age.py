from __future__ import annotations

from pathlib import Path


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_subjects_filtered_by_child_age() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    aprender_route = _read(repo_root / "apps" / "api" / "app" / "api" / "routes" / "aprender.py")
    aprender_schema = _read(repo_root / "apps" / "api" / "app" / "schemas" / "aprender.py")
    trail_screen = _read(repo_root / "apps" / "web" / "components" / "trail" / "TrailScreen.tsx")
    api_client = _read(repo_root / "apps" / "web" / "lib" / "api" / "client.ts")

    assert "Subject.age_min <= int(resolved_child_age)" in aprender_route
    assert "Subject.age_max >= int(resolved_child_age)" in aprender_route
    assert "get_child_age(child.date_of_birth, today=date.today())" in aprender_route

    assert "age_min: int = Field(alias=\"ageMin\")" in aprender_schema
    assert "age_max: int = Field(alias=\"ageMax\")" in aprender_schema

    assert "getAprenderSubjects(childId ? { childId } : undefined)" in trail_screen
    assert "childId?: number" in api_client
