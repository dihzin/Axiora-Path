from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
LATEST_BASELINE = ROOT / "docs" / "performance_baseline_latest.json"
REFERENCE_BASELINE = ROOT / "docs" / "performance_baseline_reference.json"


def _git_changed_files() -> set[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", "HEAD"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    return {line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()}


def _rg_files(pattern: str, target: str) -> set[str]:
    result = subprocess.run(
        ["rg", "-l", pattern, target],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    return {line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()}


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _core_engine_untouched(changed_files: set[str]) -> bool:
    core_files = _rg_files(r"\bresolve_nba_mode\b", "apps/api/app") | _rg_files(r"\bclass\s+AxionDecision\b", "apps/api/app")
    if not core_files:
        return False
    return len(core_files.intersection(changed_files)) == 0


def _no_pedagogical_duplication() -> bool:
    result = subprocess.run(
        ["rg", "-n", "age_min|age_max|SubjectAgeGroup|get_child_age\\(", "apps/web"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    matches = [line for line in result.stdout.splitlines() if line.strip()]
    return len(matches) == 0


def _no_new_llm_calls(changed_files: set[str]) -> bool:
    frontend_changed = [path for path in changed_files if path.startswith("apps/web/")]
    suspicious = ("openai", "llm_", "llm/", "chat/completions", "generateaxionmessage", "provider")
    for path in frontend_changed:
        lower = path.lower()
        if any(token in lower for token in suspicious):
            return False
    return True


def _xp_integrity_preserved() -> bool:
    trail_file = ROOT / "apps/web/components/trail/TrailScreen.tsx"
    if not trail_file.exists():
        return False
    content = trail_file.read_text(encoding="utf-8").lower()
    has_api_source = "getaprenderlearningprofile" in content
    has_parallel_calc = ("% 100" in content) or ("xp +=" in content) or ("xp -=" in content)
    return has_api_source and not has_parallel_calc


def _performance_within_baseline() -> bool:
    if not LATEST_BASELINE.exists():
        return False
    latest = _read_json(LATEST_BASELINE)
    reference = _read_json(REFERENCE_BASELINE) if REFERENCE_BASELINE.exists() else latest
    latest_metrics = latest.get("metrics", {})
    ref_metrics = reference.get("metrics", {})
    for endpoint in ("/trail", "/lesson", "/brain_state"):
        current_avg = float(((latest_metrics.get(endpoint) or {}).get("avg_ms")) or 0.0)
        ref_avg = float(((ref_metrics.get(endpoint) or {}).get("avg_ms")) or 0.0)
        if ref_avg <= 0:
            continue
        if current_avg > ref_avg * 1.10:
            return False
    return True


def _guardrails_intact(changed_files: set[str]) -> bool:
    return _core_engine_untouched(changed_files)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    changed_files = _git_changed_files()

    checks = [
        ("Core Engine Untouched", _core_engine_untouched(changed_files)),
        ("No Pedagogical Duplication", _no_pedagogical_duplication() and _no_new_llm_calls(changed_files)),
        ("XP Integrity Preserved", _xp_integrity_preserved()),
        ("Performance Within Baseline", _performance_within_baseline()),
        ("Guardrails Intact", _guardrails_intact(changed_files)),
    ]

    print("FASE 2 UX AUDIT RESULT:")
    for label, status in checks:
        print(f"{'✔' if status else '✖'} {label}")

    if not all(status for _, status in checks):
        print("FAIL")
        return 1

    print("UX STRUCTURE SAFE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
