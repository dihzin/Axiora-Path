#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def fail_report(failures: list[tuple[str, str]]) -> int:
    print("HERO V5 AUDIT RESULT:")
    print("FAIL")
    for name, reason in failures:
        print(f"- {name}: {reason}")
    return 1


def main() -> int:
    axion_mode = read(ROOT / "apps/api/app/services/axion_mode.py")
    models = read(ROOT / "apps/api/app/models.py")
    trail = read(ROOT / "apps/web/components/trail/TrailScreen.tsx")
    hero = read(ROOT / "apps/web/components/trail/HeroMissionCard.tsx")
    selector = read(ROOT / "apps/web/components/trail/SubjectSelector.tsx")
    perf_path = ROOT / "docs/performance_baseline_latest.json"

    failures: list[tuple[str, str]] = []

    core_untouched = "def resolve_nba_mode(" in axion_mode and "class AxionDecision(" in models
    if not core_untouched:
        failures.append(("Core Untouched", "resolve_nba_mode or AxionDecision marker missing"))

    no_backend_mutation = not any(re.search(r"fetch\s*\(|apiRequest\s*\(", text) for text in [trail, hero, selector])
    if not no_backend_mutation:
        failures.append(("No Backend Mutation", "network call found in trail/hero/selector"))

    removed_texts = all(
        marker not in hero
        for marker in [
            "Você está evoluindo!",
            "Continue assim!",
            "EXATAS",
            "Medalha",
            "MedalIcon",
        ]
    )
    minimal_structure = all(
        marker in hero
        for marker in [
            "Nível {safeLevel} 🚀",
            "XP para subir",
            "safeXpPercent",
            "compactStreak",
        ]
    )
    minimal_layout_applied = removed_texts and minimal_structure
    if not minimal_layout_applied:
        failures.append(("Minimal Layout Applied", "hero still contains redundant text/medal or misses minimal markers"))

    xp_integrity = all(
        token not in hero
        for token in [
            "setXp",
            "xpTotal +=",
            "xpInLevel +=",
            "xpToNextLevel +=",
            "reduce((acc",
        ]
    )
    if not xp_integrity:
        failures.append(("XP Integrity Preserved", "hero contains xp mutation/recalculation markers"))

    perf_ok = False
    perf_reason = "performance baseline file missing"
    if perf_path.exists():
        try:
            perf = json.loads(read(perf_path))
            trail_metric = perf.get("metrics", {}).get("/trail", {})
            avg_ms = float(trail_metric.get("avg_ms", 0))
            sample_size = int(trail_metric.get("sample_size", 0))
            perf_ok = sample_size > 0 and avg_ms <= 2500
            perf_reason = f"/trail baseline out of band (avg_ms={avg_ms}, sample_size={sample_size})"
        except Exception as exc:
            perf_ok = False
            perf_reason = f"invalid baseline json: {exc}"
    if not perf_ok:
        failures.append(("Performance Within Baseline", perf_reason))

    if failures:
        return fail_report(failures)

    print("HERO V5 AUDIT RESULT:")
    print("✔ Core Untouched")
    print("✔ No Backend Mutation")
    print("✔ Minimal Layout Applied")
    print("✔ XP Integrity Preserved")
    print("✔ Performance Within Baseline")
    print("HERO V5 SAFE")
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main())
