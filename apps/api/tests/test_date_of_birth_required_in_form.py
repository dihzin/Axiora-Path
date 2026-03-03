from __future__ import annotations

from pathlib import Path


def _parent_page_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "web" / "app" / "parent" / "page.tsx").read_text(encoding="utf-8")


def _api_client_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "web" / "lib" / "api" / "client.ts").read_text(encoding="utf-8")


def test_date_of_birth_required_in_form() -> None:
    page = _parent_page_source()
    client = _api_client_source()

    assert "type=\"date\"" in page
    assert "required value={newChildDateOfBirth}" in page
    assert "required value={editingChildDateOfBirth}" in page
    assert "Informe a data de nascimento da criança." in page
    assert "normalizeIsoDateOnly" in page
    assert "date_of_birth: isoDateOfBirth" in page
    assert "new Date(newChildDateOfBirth)" not in page
    assert "new Date(editingChildDateOfBirth)" not in page

    assert "date_of_birth: string;" in client
    assert "payload: { display_name: string; date_of_birth: string; theme: ThemeName; avatar_key?: string | null }" in client
