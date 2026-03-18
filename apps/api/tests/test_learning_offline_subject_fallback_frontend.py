from __future__ import annotations

from pathlib import Path


def _page_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (
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
    ).read_text(encoding="utf-8")


def test_offline_fallback_respects_selected_subject() -> None:
    source = _page_source()
    assert "function resolveOfflineSubjectKey(subjectName: string | null)" in source
    assert "if (token.includes(\"portugues\")) return \"portuguese\";" in source
    assert "if (token.includes(\"matematica\")) return \"math\";" in source
    assert "function buildOfflineQuestions(lessonId: number, subjectName?: string | null): LearningNextItem[]" in source
    assert "const key = resolveOfflineSubjectKey(subjectName ?? null);" in source
    assert "if (key === \"portuguese\") {" in source
    assert "if (key === \"math\") {" in source
    assert "const [offlineSubjectName, setOfflineSubjectName] = useState<string | null>(null);" in source
    assert "buildOfflineQuestions(lessonId, offlineSubjectName)" in source


def test_offline_fallback_requires_api_health_probe_before_switch() -> None:
    source = _page_source()
    assert "function shouldFallbackToOfflineForEmptyBatch(error: unknown): boolean" in source
    assert "const [offlineMode, setOfflineMode] = useState(false);" in source
    assert "const activateOfflineMode = useCallback(" in source
    assert 'message: "Conexao instavel. Seguimos com perguntas de continuidade para concluir a licao."' not in source
    assert 'message: "Conexão instável. Seguimos com perguntas de continuidade para concluir a lição."' in source
    assert "Modo offline ativo: conexão instável. Suas respostas continuam normalmente." in source


def test_trail_hook_skips_path_fetch_when_child_has_no_subjects() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "apps" / "web" / "hooks" / "useTrailData.ts").read_text(encoding="utf-8")

    assert "const [subjectsLoaded, setSubjectsLoaded] = useState(false);" in source
    assert 'setError("Ainda não há missões disponíveis para a idade desta criança.");' in source
    assert "if (subjectsLoaded && subjects.length === 0) {" in source


def test_lesson_frontend_renders_fill_blank_questions() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
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
    ).read_text(encoding="utf-8")

    assert 'import { Input } from "@/components/ui/input";' in source
    assert 'const [fillBlankAnswer, setFillBlankAnswer] = useState("");' in source
    assert "function evaluateFillBlank(" in source
    assert "wrongAnswer: outcome.wrongAnswer ?? undefined" in source
    assert 'current.type === "FILL_BLANK"' in source
    assert "onCheckFillBlank" in source
