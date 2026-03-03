from __future__ import annotations

from pathlib import Path


def _page_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "web" / "app" / "child" / "axion" / "page.tsx").read_text(encoding="utf-8")


def test_axion_button_changes_based_on_brain_state() -> None:
    source = _page_source()
    assert "const adaptiveButton = useMemo(() => {" in source
    assert "weakestMastery < 0.5" in source
    assert "label: `Reforcar ${labelSubject}`" in source
    assert "averageMastery > 0.8" in source
    assert 'label: "Desafio Avancado"' in source
    assert 'label: "Continuar Jornada"' in source
    assert "data-testid=\"axion-primary-cta\"" in source
    assert '{loading || !brief ? "Carregando sugestao..." : adaptiveButton.label}' in source


def test_subject_status_color_mapping() -> None:
    source = _page_source()
    assert "function getSubjectStatus(score: number): SubjectStatus {" in source
    assert "if (score >= 0.75) return \"strong\";" in source
    assert "if (score >= 0.5) return \"stable\";" in source
    assert "return \"needs_attention\";" in source
    assert "const SUBJECT_STATUS_STYLE: Record<SubjectStatus, string> = {" in source
    assert 'strong: "border-[#B9EAD8] bg-[#EAF9F2] text-[#0E8F62]"' in source
    assert 'stable: "border-[#F7D8A3] bg-[#FFF5DF] text-[#B87400]"' in source
    assert 'needs_attention: "border-[#F3B8B8] bg-[#FFECEC] text-[#B23B3B]"' in source
    assert "const subjectStatus = getSubjectStatus(Number(item.masteryScore ?? 0));" in source
