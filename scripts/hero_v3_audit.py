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
    # Basic emoji ranges enough for audit scope.
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


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    axion_mode = read(ROOT / "apps/api/app/services/axion_mode.py")
    models = read(ROOT / "apps/api/app/models.py")
    hero = read(ROOT / "apps/web/components/trail/HeroMissionCard.tsx")
    topbar = read(ROOT / "apps/web/components/trail/TopStatsBar.tsx")
    selector = read(ROOT / "apps/web/components/trail/SubjectSelector.tsx")
    perf_path = ROOT / "docs/performance_baseline_latest.json"

    core_untouched = "def resolve_nba_mode(" in axion_mode and "class AxionDecision(" in models
    checks.append(("Core Untouched", core_untouched, "resolve_nba_mode or AxionDecision marker missing"))

    no_backend_mutation = not any(re.search(r"fetch\s*\(|apiRequest\s*\(", text) for text in [hero, topbar, selector])
    checks.append(("No Backend Mutation", no_backend_mutation, "network call found in hero/topbar/selector"))

    svg_system_active = all(
        (ROOT / rel).exists()
        for rel in [
            "apps/web/components/ui/icons/FlameIcon.tsx",
            "apps/web/components/ui/icons/GemIcon.tsx",
            "apps/web/components/ui/icons/StarIcon.tsx",
            "apps/web/components/ui/icons/MedalIcon.tsx",
            "apps/web/components/ui/icons/BrainIcon.tsx",
        ]
    )
    checks.append(("SVG Icon System Active", svg_system_active, "one or more required SVG icon components are missing"))

    no_png_or_emoji = not any(
        token in (hero + topbar).lower() for token in [".png", "emoji", "🧠", "🔥", "💎", "⭐", "🏅", "🥇", "🥈", "🥉", "📚", "💬"]
    ) and not has_emoji(hero + topbar)
    checks.append(("Hero/Topbar Visual Purity", no_png_or_emoji, "emoji/png detected in hero/topbar"))

    has_high_z = bool(re.search(r"z-\[(7\d|8\d|9\d|[1-9]\d{2,})\]|z-50", selector))
    dropdown_layer_fixed = (
        has_high_z
        and ("aria-controls=\"subject-selector-listbox\"" in selector)
        and ("absolute" in selector and "top-[52px]" in selector)
    )
    checks.append(("Dropdown Layer Fixed", dropdown_layer_fixed, "dropdown layer or placement markers missing"))

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
        except Exception as exc:  # pragma: no cover
            perf_ok = False
            perf_reason = f"invalid baseline json: {exc}"
    checks.append(("Performance Within Baseline", perf_ok, perf_reason))

    failed = [c for c in checks if not c[1]]
    if failed:
        print("HERO V3 AUDIT RESULT:")
        print("FAIL")
        for name, _, reason in failed:
            print(f"- {name}: {reason}")
        return 1

    print("HERO V3 AUDIT RESULT:")
    print("✔ Core Untouched")
    print("✔ No Backend Mutation")
    print("✔ SVG Icon System Active")
    print("✔ Dropdown Layer Fixed")
    print("✔ Performance Within Baseline")
    print("HERO V3 SAFE")
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main())
