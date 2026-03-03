from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
LATEST_BASELINE = ROOT / "docs" / "performance_baseline_latest.json"
REFERENCE_BASELINE = ROOT / "docs" / "performance_baseline_reference.json"
LEARNING_ROUTE = ROOT / "apps" / "api" / "app" / "api" / "routes" / "learning.py"


def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, check=False)


def _git_changed_files() -> set[str]:
    result = _run(["git", "diff", "--name-only", "HEAD"])
    return {line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()}


def _rg_files(pattern: str, target: str) -> set[str]:
    result = _run(["rg", "-l", pattern, target])
    return {line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()}


def _core_engine_untouched(changed_files: set[str]) -> bool:
    resolve_files = _rg_files(r"\bresolve_nba_mode\b", "apps/api/app")
    decision_files = _rg_files(r"\bclass\s+AxionDecision\b", "apps/api/app")
    core_files = resolve_files | decision_files
    if not core_files:
        return False
    return len(core_files.intersection(changed_files)) == 0


def _no_pedagogical_duplication() -> bool:
    result = _run(["rg", "-n", "age_min|age_max|SubjectAgeGroup|get_child_age\\(", "apps/web"])
    return len([line for line in result.stdout.splitlines() if line.strip()]) == 0


def _no_new_llm_activation(changed_files: set[str]) -> bool:
    scoped = [path for path in changed_files if path.startswith("apps/web/") or path.startswith("scripts/")]
    llm_tokens = ("openai", "chat/completions", "llm_", "llm/", "generateaxionmessage", "anthropic")
    for path in scoped:
        full_path = ROOT / path
        if not full_path.exists() or not full_path.is_file():
            continue
        try:
            content = full_path.read_text(encoding="utf-8").lower()
        except UnicodeDecodeError:
            continue
        if any(token in content for token in llm_tokens):
            return False
    return True


def _no_new_endpoints_created() -> bool:
    status = _run(["git", "diff", "--name-status", "HEAD", "--", "apps/api/app/api/routes"])
    for line in status.stdout.splitlines():
        parts = line.strip().split("\t")
        if not parts:
            continue
        if parts[0] == "A":
            return False
    return True


def _xp_integrity_preserved() -> bool:
    forbidden_patterns = [
        r"\bxp\s*\+=",
        r"\bxp\s*-\=",
        r"setXp\(\s*prev\s*=>",
        r"setXp\([^)]*[+\-][^)]*\)",
    ]
    for pattern in forbidden_patterns:
        result = _run(["rg", "-n", pattern, "apps/web"])
        if any(line.strip() for line in result.stdout.splitlines()):
            return False
    trail = (ROOT / "apps/web/components/trail/TrailScreen.tsx").read_text(encoding="utf-8").lower()
    return "getaprenderlearningprofile" in trail


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _performance_within_baseline() -> bool:
    if not LATEST_BASELINE.exists():
        return False
    latest = _read_json(LATEST_BASELINE)
    reference = _read_json(REFERENCE_BASELINE) if REFERENCE_BASELINE.exists() else latest
    latest_metrics = latest.get("metrics", {})
    reference_metrics = reference.get("metrics", {})

    for endpoint in ("/trail", "/lesson", "/brain_state"):
        current = latest_metrics.get(endpoint) or {}
        ref = reference_metrics.get(endpoint) or {}
        current_avg = float(current.get("avg_ms") or 0.0)
        ref_avg = float(ref.get("avg_ms") or 0.0)
        current_queries = float(current.get("avg_queries") or 0.0)
        ref_queries = float(ref.get("avg_queries") or 0.0)

        if ref_avg > 0 and current_avg > ref_avg * 1.10:
            return False
        if ref_queries > 0 and current_queries > ref_queries * 1.10:
            return False
    return True


def _guardrails_intact(changed_files: set[str]) -> bool:
    if not _no_new_endpoints_created():
        return False
    if LEARNING_ROUTE.exists():
        learning_text = LEARNING_ROUTE.read_text(encoding="utf-8")
        required_tokens = ("candidates_raw", "candidates_filtered", "fallback_reason", "block_reason")
        if not all(token in learning_text for token in required_tokens):
            return False
    return _core_engine_untouched(changed_files)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    changed_files = _git_changed_files()

    checks = [
        ("Core Engine Untouched", _core_engine_untouched(changed_files)),
        ("XP Integrity Preserved", _xp_integrity_preserved()),
        ("No Pedagogical Duplication", _no_pedagogical_duplication()),
        ("No LLM Activation", _no_new_llm_activation(changed_files)),
        ("Performance Within Baseline", _performance_within_baseline()),
        ("Guardrails Intact", _guardrails_intact(changed_files)),
    ]

    print("FASE 3 GAMIFICATION AUDIT RESULT:")
    for label, status in checks:
        print(f"{'✔' if status else '✖'} {label}")

    if not all(status for _, status in checks):
        print("FAIL")
        return 1

    print("SYSTEM GAMIFICATION SAFE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
