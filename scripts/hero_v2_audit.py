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
    hero_card_path = ROOT / "apps/web/components/trail/HeroMissionCard.tsx"
    trail_screen_path = ROOT / "apps/web/components/trail/TrailScreen.tsx"
    perf_path = ROOT / "docs/performance_baseline_latest.json"

    axion_mode = read_text(axion_mode_path)
    models_text = read_text(models_path)
    hero_card = read_text(hero_card_path)
    trail_screen = read_text(trail_screen_path)

    core_untouched = "def resolve_nba_mode(" in axion_mode and "class AxionDecision(" in models_text
    checks.append(("Core Untouched", core_untouched, "resolve_nba_mode or AxionDecision marker missing"))

    no_backend_mutation = not re.search(r"fetch\s*\(|apiRequest\s*\(", hero_card)
    checks.append(("No Backend Mutation", no_backend_mutation, "network call found in HeroMissionCard"))

    xp_integrity = not re.search(r"setXp|xpTotal\s*[\+\-\*/]=|xpPercent\s*[\+\-\*/]=|\+\=", hero_card)
    checks.append(("XP Integrity Preserved", xp_integrity, "XP mutation or accumulation found"))

    no_pedagogical_dup = not any(
        token in hero_card.lower()
        for token in ["date_of_birth", "agegroup", "adaptive", "difficulty", "prerequisite", "pedagog"]
    )
    checks.append(("No Pedagogical Duplication", no_pedagogical_dup, "pedagogical frontend duplication marker found"))

    streak_xp_safe = not re.search(r"streak.*xp|xp.*streak", hero_card, flags=re.IGNORECASE)
    checks.append(("Streak XP Safety", streak_xp_safe, "streak is linked to xp mutation logic"))

    medal_xp_safe = not re.search(r"medal.*xp|xp.*medal", hero_card, flags=re.IGNORECASE)
    checks.append(("Medal XP Safety", medal_xp_safe, "medal is linked to xp mutation logic"))

    trail_screen_safe = "fetch(" not in trail_screen and "apiRequest(" not in trail_screen
    checks.append(("TrailScreen API Safety", trail_screen_safe, "inline network call found in TrailScreen"))

    perf_ok = False
    perf_reason = "performance baseline file missing"
    if perf_path.exists():
        try:
            perf = json.loads(read_text(perf_path))
            trail_metric = perf.get("metrics", {}).get("/trail", {})
            avg_ms = float(trail_metric.get("avg_ms", 0))
            sample_size = int(trail_metric.get("sample_size", 0))
            perf_ok = sample_size > 0 and avg_ms <= 2500
            perf_reason = f"/trail baseline out of band (avg_ms={avg_ms}, sample_size={sample_size})"
        except Exception as exc:  # pragma: no cover
            perf_ok = False
            perf_reason = f"invalid baseline json: {exc}"
    checks.append(("Performance Within Baseline", perf_ok, perf_reason))

    failing = [item for item in checks if not item[1]]
    if failing:
        print("HERO V2 AUDIT RESULT:")
        print("FAIL")
        for name, _, reason in failing:
            print(f"- {name}: {reason}")
        return 1

    print("HERO V2 AUDIT RESULT:")
    print("✔ Core Untouched")
    print("✔ No Backend Mutation")
    print("✔ XP Integrity Preserved")
    print("✔ No Pedagogical Duplication")
    print("✔ Performance Within Baseline")
    print("HERO V2 SAFE")
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main())

