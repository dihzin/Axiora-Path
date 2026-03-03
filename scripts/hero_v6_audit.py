#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def has_emoji(text: str) -> bool:
    emoji_re = re.compile(
        "["
        "\U0001F300-\U0001F5FF"
        "\U0001F600-\U0001F64F"
        "\U0001F680-\U0001F6FF"
        "\U0001F700-\U0001F77F"
        "\U0001F780-\U0001F7FF"
        "\U0001F900-\U0001F9FF"
        "\U0001FA00-\U0001FAFF"
        "\u2600-\u27BF"
        "]+",
        flags=re.UNICODE,
    )
    return bool(emoji_re.search(text))


def fail_report(failures: list[tuple[str, str]]) -> int:
    print("HERO V6 AUDIT RESULT:")
    print("FAIL")
    for name, reason in failures:
        print(f"- {name}: {reason}")
    return 1


def main() -> int:
    axion_mode = read(ROOT / "apps/api/app/services/axion_mode.py")
    models = read(ROOT / "apps/api/app/models.py")
    trail = read(ROOT / "apps/web/components/trail/TrailScreen.tsx")
    hero = read(ROOT / "apps/web/components/trail/HeroMissionCard.tsx")
    perf_path = ROOT / "docs/performance_baseline_latest.json"

    failures: list[tuple[str, str]] = []

    core_untouched = "def resolve_nba_mode(" in axion_mode and "class AxionDecision(" in models
    if not core_untouched:
        failures.append(("Core Untouched", "resolve_nba_mode or AxionDecision marker missing"))

    no_backend_mutation = not any(re.search(r"fetch\s*\(|apiRequest\s*\(", text) for text in [trail, hero])
    if not no_backend_mutation:
        failures.append(("No Backend Mutation", "network call found in trail/hero"))

    custom_svg_icons_active = all(
        (ROOT / rel).exists()
        for rel in [
            "apps/web/components/ui/icons/LevelUpIcon.tsx",
            "apps/web/components/ui/icons/StreakFlameIcon.tsx",
        ]
    ) and all(token in hero for token in ["LevelUpIcon", "StreakFlameIcon"])
    if not custom_svg_icons_active:
        failures.append(("Custom SVG Icons Active", "custom V6 SVG icons missing or not used in hero"))

    no_emoji_present = not has_emoji(hero) and all(token not in hero for token in ["🚀", "🔥"])
    if not no_emoji_present:
        failures.append(("No Emoji Present", "emoji detected in hero"))

    strong_identity_gradient = all(color in hero for color in ["#2F5BFF", "#3A78F2", "#4C8CFF"])
    no_green_gradient = all(token not in hero for token in ["#34D399", "#2CBFA5", "#29C2B3", "#34D3"])
    if not (strong_identity_gradient and no_green_gradient):
        failures.append(("Strong Identity Gradient Applied", "hero gradient palette is not blue-only identity"))

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

    print("HERO V6 AUDIT RESULT:")
    print("✔ Core Untouched")
    print("✔ No Backend Mutation")
    print("✔ Custom SVG Icons Active")
    print("✔ No Emoji Present")
    print("✔ Strong Identity Gradient Applied")
    print("✔ XP Integrity Preserved")
    print("✔ Performance Within Baseline")
    print("HERO V6 SAFE")
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main())
