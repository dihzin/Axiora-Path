#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    axion_mode_path = ROOT / "apps/api/app/services/axion_mode.py"
    models_path = ROOT / "apps/api/app/models.py"
    trail_screen_path = ROOT / "apps/web/components/trail/TrailScreen.tsx"
    hero_card_path = ROOT / "apps/web/components/trail/HeroMissionCard.tsx"
    weekly_card_path = ROOT / "apps/web/components/trail/WeeklyGoalCard.tsx"
    missions_panel_path = ROOT / "apps/web/components/trail/DailyMissionsPanel.tsx"
    perf_path = ROOT / "docs/performance_baseline_latest.json"

    axion_mode = read_text(axion_mode_path)
    models_text = read_text(models_path)
    trail_screen = read_text(trail_screen_path)
    hero_card = read_text(hero_card_path)
    weekly_card = read_text(weekly_card_path)
    missions_panel = read_text(missions_panel_path)

    core_untouched = "def resolve_nba_mode(" in axion_mode and "class AxionDecision(" in models_text
    checks.append(("Core Untouched", core_untouched, "resolve_nba_mode or AxionDecision marker missing"))

    frontend_targets = [hero_card, weekly_card, missions_panel]
    backend_mutation = any(re.search(r"fetch\s*\(|apiRequest\s*\(", content) for content in frontend_targets)
    checks.append(("No Backend Mutation", not backend_mutation, "backend/network call found in presentation components"))

    xp_bad_patterns = [
        r"setXp",
        r"xpTotal\s*[\+\-\*/]=",
        r"xpPercent\s*[\+\-\*/]=",
        r"\+\=",
    ]
    xp_integrity = not any(re.search(pattern, hero_card) for pattern in xp_bad_patterns)
    checks.append(("XP Integrity Preserved", xp_integrity, "xp mutation or accumulation detected in HeroMissionCard"))

    pedagogy_keywords = [
        "ageGroup",
        "date_of_birth",
        "difficulty",
        "adaptive",
        "prerequisite",
        "pedagog",
    ]
    no_pedagogy_dup = not any(keyword in (hero_card + weekly_card + missions_panel) for keyword in pedagogy_keywords)
    checks.append(("No Pedagogical Duplication", no_pedagogy_dup, "pedagogical rule keyword found in UI components"))

    perf_ok = False
    perf_reason = "performance baseline file missing"
    if perf_path.exists():
        try:
            perf = json.loads(read_text(perf_path))
            trail_metric = perf.get("metrics", {}).get("/trail", {})
            avg_ms = float(trail_metric.get("avg_ms", 0))
            sample_size = int(trail_metric.get("sample_size", 0))
            # Guardrail: keep baseline in acceptable band for current repo target.
            perf_ok = sample_size > 0 and avg_ms <= 2500
            perf_reason = f"/trail baseline out of band (avg_ms={avg_ms}, sample_size={sample_size})"
        except Exception as exc:  # pragma: no cover
            perf_ok = False
            perf_reason = f"invalid baseline json: {exc}"
    checks.append(("Performance Within Baseline", perf_ok, perf_reason))

    # Extra safety: TrailScreen must still consume existing API hooks and not inline new network calls.
    no_inline_fetch = "fetch(" not in trail_screen and "apiRequest(" not in trail_screen
    checks.append(("TrailScreen API Safety", no_inline_fetch, "inline fetch/apiRequest found in TrailScreen"))

    failing = [item for item in checks if not item[1]]
    if failing:
        print("HERO MODE AUDIT RESULT:")
        print("FAIL")
        for name, _, reason in failing:
            print(f"- {name}: {reason}")
        return 1

    print("HERO MODE AUDIT RESULT:")
    print("✔ Core Untouched")
    print("✔ No Backend Mutation")
    print("✔ XP Integrity Preserved")
    print("✔ No Pedagogical Duplication")
    print("✔ Performance Within Baseline")
    print("HERO LAYOUT SAFE")
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main())
