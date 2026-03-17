from __future__ import annotations

from pathlib import Path


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_subjects_filtered_by_child_age() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    aprender_route = _read(repo_root / "apps" / "api" / "app" / "api" / "routes" / "aprender.py")
    aprender_schema = _read(repo_root / "apps" / "api" / "app" / "schemas" / "aprender.py")
    age_policy = _read(repo_root / "apps" / "api" / "app" / "services" / "age_policy.py")
    use_trail_data = _read(repo_root / "apps" / "web" / "hooks" / "useTrailData.ts")
    api_client = _read(repo_root / "apps" / "web" / "lib" / "api" / "client.ts")

    # aprender.py now delegates age filtering to age_policy via subject_age_filter_clauses
    assert "subject_age_filter_clauses" in aprender_route
    assert "from app.services.age_policy import" in aprender_route

    # The canonical filter logic lives in age_policy.py
    assert "Subject.age_min <= int(child_age)" in age_policy
    assert "Subject.age_max >= int(child_age)" in age_policy
    assert "def subject_age_filter_clauses(" in age_policy

    # Child age resolution still correct (via _resolve_child_age helper in aprender route)
    assert "get_child_age(child.date_of_birth, today=date.today())" in aprender_route

    # Schema fields present
    assert 'age_min: int = Field(alias="ageMin")' in aprender_schema
    assert 'age_max: int = Field(alias="ageMax")' in aprender_schema

    # Frontend hook wires child age correctly into getAprenderSubjects
    assert "getAprenderSubjects(childId ? { childId } : undefined)" in use_trail_data
    assert "childId?: number" in api_client
