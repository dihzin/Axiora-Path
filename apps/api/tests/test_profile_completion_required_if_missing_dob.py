from __future__ import annotations

from pathlib import Path


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_profile_completion_required_if_missing_dob() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    middleware_source = _read(repo_root / "apps" / "web" / "lib" / "profile-completion-middleware.ts")
    shell_source = _read(repo_root / "apps" / "web" / "components" / "child-desktop-shell.tsx")
    child_home_source = _read(repo_root / "apps" / "web" / "app" / "child" / "page.tsx")
    completion_screen_source = _read(repo_root / "apps" / "web" / "app" / "parent" / "profile-completion" / "page.tsx")
    api_client_source = _read(repo_root / "apps" / "web" / "lib" / "api" / "client.ts")

    assert "export async function enforceProfileCompletionRedirect" in middleware_source
    assert "missingDateOfBirth || child.needs_profile_completion" in middleware_source
    assert "PROFILE_COMPLETION_PATH" in middleware_source
    assert "params.redirect(`${PROFILE_COMPLETION_PATH}?childId=${child.id}`);" in middleware_source

    assert "enforceProfileCompletionRedirect" in shell_source
    assert "router.replace(target)" in shell_source

    assert "enforceProfileCompletionRedirect" in child_home_source
    assert "router.replace(target)" in child_home_source

    assert "Precisamos da sua data de nascimento para personalizar seu aprendizado." in completion_screen_source
    assert "/parent?childId=" in completion_screen_source

    assert "date_of_birth: string | null;" in api_client_source
