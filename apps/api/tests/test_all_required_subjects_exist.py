from __future__ import annotations

from pathlib import Path


REQUIRED_SUBJECTS = [
    "Matemática",
    "Português",
    "Inglês",
    "História",
    "Geografia",
    "Ciências",
    "Física",
    "Química",
    "Filosofia",
    "Artes",
    "Educação Financeira",
    "Lógica",
    "Programação básica",
    "Redação",
]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _normalize(value: str) -> str:
    return (
        value.replace("á", "a")
        .replace("à", "a")
        .replace("â", "a")
        .replace("ã", "a")
        .replace("é", "e")
        .replace("ê", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ô", "o")
        .replace("õ", "o")
        .replace("ú", "u")
        .replace("ç", "c")
        .lower()
    )


def test_all_required_subjects_exist() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    migration_source = _read(repo_root / "apps" / "api" / "alembic" / "versions" / "0092_required_subject_catalog.py")
    content_seed_source = _read(repo_root / "apps" / "api" / "scripts" / "seed_aprender_content.py")
    structure_seed_source = _read(repo_root / "apps" / "api" / "scripts" / "seed_aprender_curriculum_structure.py")
    dropdown_source = _read(repo_root / "apps" / "web" / "components" / "trail" / "TrailScreen.tsx")
    model_source = _read(repo_root / "apps" / "api" / "app" / "models.py")

    assert "age_min" in model_source
    assert "age_max" in model_source

    for subject in REQUIRED_SUBJECTS:
        assert subject in migration_source
        assert subject in content_seed_source
        assert subject in structure_seed_source
        assert _normalize(subject) in dropdown_source
