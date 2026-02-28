from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
MAIN_FILE = ROOT / "apps" / "api" / "app" / "main.py"
PERF_MIDDLEWARE_FILE = ROOT / "apps" / "api" / "app" / "core" / "performance_middleware.py"
QUERY_COUNTER_FILE = ROOT / "apps" / "api" / "app" / "core" / "query_counter.py"
LEARNING_ROUTE_FILE = ROOT / "apps" / "api" / "app" / "api" / "routes" / "learning.py"
BENCHMARK_OUTPUT_FILE = ROOT / "docs" / "performance_baseline_latest.json"
FRONTEND_DIR = ROOT / "apps" / "web"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _git_changed_files_since_head() -> set[str]:
    cmd = ["git", "diff", "--name-only", "HEAD"]
    result = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, check=False)
    changed: set[str] = set()
    for line in result.stdout.splitlines():
        path = line.strip().replace("\\", "/")
        if path:
            changed.add(path)
    return changed


def _find_files_with_pattern(pattern: str) -> set[str]:
    cmd = ["rg", "-l", pattern, "apps/api/app"]
    result = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, check=False)
    matches: set[str] = set()
    for line in result.stdout.splitlines():
        path = line.strip().replace("\\", "/")
        if path:
            matches.add(path)
    return matches


def _core_engine_untouched() -> bool:
    resolve_files = _find_files_with_pattern(r"\bresolve_nba_mode\b")
    decision_files = _find_files_with_pattern(r"\bclass\s+AxionDecision\b")
    core_targets = resolve_files | decision_files
    if not core_targets:
        return False
    changed_files = _git_changed_files_since_head()
    return len(core_targets.intersection(changed_files)) == 0


def _frontend_age_duplication_absent() -> bool:
    cmd = ["rg", "-n", "age_min|age_max|SubjectAgeGroup|get_child_age\\(", str(FRONTEND_DIR)]
    result = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, check=False)
    matches = [line for line in result.stdout.splitlines() if line.strip()]
    return len(matches) == 0


def _benchmark_has_minimum_requests() -> tuple[bool, dict]:
    if not BENCHMARK_OUTPUT_FILE.exists():
        return False, {}
    payload = json.loads(BENCHMARK_OUTPUT_FILE.read_text(encoding="utf-8"))
    total = int(payload.get("total_requests") or 0)
    return total >= 150, payload


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    main_text = _read(MAIN_FILE)
    perf_text = _read(PERF_MIDDLEWARE_FILE)
    query_text = _read(QUERY_COUNTER_FILE)
    learning_route_text = _read(LEARNING_ROUTE_FILE)

    checks: list[tuple[str, bool]] = []
    checks.append(
        (
            "Instrumentation Active",
            (
                "PerformanceMiddleware" in main_text
                and "app.add_middleware(PerformanceMiddleware)" in main_text
                and '"type": "performance"' in perf_text
                and '"duration_ms"' in perf_text
            ),
        )
    )
    checks.append(
        (
            "Query Counter Active",
            (
                "register_query_counter_listener()" in main_text
                and "before_cursor_execute" in query_text
                and "ContextVar" in query_text
                and '"query_count"' in perf_text
            ),
        )
    )
    core_engine_untouched = _core_engine_untouched()
    checks.append(("Core Engine Untouched", core_engine_untouched))
    checks.append(
        (
            "Guardrails Intact",
            (
                "learning_next_empty_batch" in learning_route_text
                and "candidates_raw" in learning_route_text
                and "candidates_filtered" in learning_route_text
                and "fallback_reason" in learning_route_text
                and "block_reason" in learning_route_text
            ),
        )
    )
    checks.append(("No Pedagogical Mutation", core_engine_untouched))
    bench_ok, bench_payload = _benchmark_has_minimum_requests()
    checks.append(("Logs Structured", '"status"' in perf_text and '"method"' in perf_text))
    checks.append(("Benchmark >= 150 requests", bench_ok))
    checks.append(("Baseline Created", BENCHMARK_OUTPUT_FILE.exists()))
    checks.append(("No Frontend Age Rule Duplication", _frontend_age_duplication_absent()))

    core_required = {
        "Instrumentation Active",
        "Query Counter Active",
        "Core Engine Untouched",
        "Guardrails Intact",
        "No Pedagogical Mutation",
        "Logs Structured",
        "Benchmark >= 150 requests",
        "Baseline Created",
        "No Frontend Age Rule Duplication",
    }
    passed_required = all(status for name, status in checks if name in core_required)

    print("FASE 1 AUDIT RESULT:")
    for label in (
        "Instrumentation Active",
        "Query Counter Active",
        "Core Engine Untouched",
        "Guardrails Intact",
        "No Pedagogical Mutation",
        "Baseline Created",
    ):
        status = next((state for name, state in checks if name == label), False)
        marker = "✔" if status else "✖"
        print(f"{marker} {label}")

    if not passed_required:
        print("FAIL")
        return 1

    total = int(bench_payload.get("total_requests") or 0)
    if total < 150:
        print("FAIL")
        return 1

    print("SYSTEM SAFE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
