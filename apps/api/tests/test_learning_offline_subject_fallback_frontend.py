from __future__ import annotations

from pathlib import Path


def _page_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "web" / "app" / "child" / "aprender" / "lesson" / "[id]" / "page.tsx").read_text(encoding="utf-8")


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
    assert "async function isApiReachable(): Promise<boolean>" in source
    assert "fetch(`${base}/health`" in source
    assert "async function shouldEnterOfflineFallback(error: unknown): Promise<boolean>" in source
    assert "const reachable = await isApiReachable();" in source
    assert "return !reachable;" in source
    assert "if (await shouldEnterOfflineFallback(batchErr)) {" in source
    assert "if (await shouldEnterOfflineFallback(err)) {" in source
