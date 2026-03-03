#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TARGET_FILES = [
    ROOT / "apps/web/components/trail/HeroMissionCard.tsx",
    ROOT / "apps/web/components/trail/SubjectSelector.tsx",
    ROOT / "apps/web/components/trail/UnitBlock.tsx",
    ROOT / "apps/web/components/trail/TrailPath.tsx",
    ROOT / "apps/web/components/trail/LessonNode.tsx",
    ROOT / "apps/web/components/ui/button.tsx",
    ROOT / "apps/web/components/trail/TrailScreen.tsx",
    ROOT / "apps/web/theme/design-tokens.ts",
]


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


def main() -> int:
    failures: list[str] = []
    depth_failures: list[str] = []
    motion_failures: list[str] = []
    atmosphere_failures: list[str] = []

    for path in TARGET_FILES:
        if not path.exists():
            failures.append(f"arquivo ausente: {path.relative_to(ROOT)}")

    if failures:
        print("IDENTITY V1 FAIL")
        for reason in failures:
            print(f"- {reason}")
        return 1

    content = {path.relative_to(ROOT).as_posix(): read(path) for path in TARGET_FILES}
    blue_debug_hits: list[tuple[str, int, str]] = []
    joined = "\n".join(content.values())

    # 1) Nenhum emoji presente.
    if has_emoji(joined):
        failures.append("emoji detectado nos componentes auditados")

    # 2) Nenhum azul SaaS dominante (heurística por paleta antiga banida).
    banned_blues = [
        "#2F5BFF",
        "#3A78F2",
        "#4C8CFF",
        "#4C82FF",
        "#3A71EB",
        "#3F78F0",
        "#2E9EEA",
        "#315E9F",
        "#2A78CA",
    ]
    banned_blue_hits = []
    for path in TARGET_FILES:
        try:
            file_text = read(path)
        except Exception:
            continue
        for line_no, line in enumerate(file_text.splitlines(), start=1):
            if any(token.lower() in line.lower() for token in banned_blues):
                banned_blue_hits.append((str(path.resolve()), line_no, line.strip()))
    if banned_blue_hits:
        blue_debug_hits.extend(banned_blue_hits)
        failures.append("paleta azul SaaS dominante ainda presente")

    # 3) energy-gradient aplicado corretamente.
    tokens = content["apps/web/theme/design-tokens.ts"]
    hero = content["apps/web/components/trail/HeroMissionCard.tsx"]
    selector = content["apps/web/components/trail/SubjectSelector.tsx"]
    has_energy_token = "linear-gradient(135deg, #FF6B3D 0%, #FF8A63 100%)" in tokens
    energy_used = "bg-[linear-gradient(135deg,#FF6B3D_0%,#FF8A63_100%)]" in hero and "bg-[linear-gradient(135deg,#FF6B3D_0%,#FF8A63_100%)]" in selector
    if not (has_energy_token and energy_used):
        failures.append("energy-gradient ausente ou não aplicado corretamente")

    # 4) XP vindo exclusivamente da API (via props no hero, sem fetch local).
    hero_has_xp_props = all(k in hero for k in ["xpPercent", "xpInLevel", "xpToNextLevel"])
    hero_no_network = not re.search(r"fetch\s*\(|apiRequest\s*\(|axios\.", hero)
    if not (hero_has_xp_props and hero_no_network):
        failures.append("XP não está estritamente consumido via props/API no Hero")

    # 5) Nenhum cálculo duplicado no frontend (heurística anti-acúmulo/mutação XP).
    if any(token in joined for token in ["xpTotal +=", "xpInLevel +=", "xpToNextLevel +=", "setXp(", "let xp =", "const xp = xp +"]):
        failures.append("detecção de cálculo/duplicação de XP no frontend")

    # 6) Nenhuma modificação backend (guardrails core intactos).
    try:
        axion_mode = read(ROOT / "apps/api/app/services/axion_mode.py")
        models = read(ROOT / "apps/api/app/models.py")
        if "def resolve_nba_mode(" not in axion_mode or "class AxionDecision(" not in models:
            failures.append("guardrails backend ausentes (resolve_nba_mode/AxionDecision)")
    except Exception as exc:
        failures.append(f"não foi possível validar guardrails backend: {exc}")

    # 7) Performance dentro baseline.
    perf_path = ROOT / "docs/performance_baseline_latest.json"
    perf_ok = False
    if perf_path.exists():
        try:
            perf = json.loads(read(perf_path))
            trail_metric = perf.get("metrics", {}).get("/trail", {})
            avg_ms = float(trail_metric.get("avg_ms", 0))
            sample_size = int(trail_metric.get("sample_size", 0))
            perf_ok = sample_size > 0 and avg_ms <= 2500
            if not perf_ok:
                failures.append(f"baseline /trail fora da faixa (avg_ms={avg_ms}, sample_size={sample_size})")
        except Exception as exc:
            failures.append(f"baseline de performance inválido: {exc}")
    else:
        failures.append("arquivo de baseline de performance ausente")

    # 8) Shapes orgânicos ativos.
    organic_pattern = re.compile(r"rounded-\[(?:\d+px_){3}\d+px\]")
    organic_found = any(organic_pattern.search(text) for text in [hero, selector, content["apps/web/components/trail/UnitBlock.tsx"]])
    if not organic_found:
        failures.append("shapes orgânicos não detectados")

    # 9) Verificação global de azul SaaS no escopo permitido.
    blue_token_re = re.compile(r"\b(?:text-blue-|bg-blue-|border-blue-)")
    blue_hex_re = re.compile(r"#(?:3B82F6|2563EB)\b", flags=re.IGNORECASE)
    blue_hits: list[str] = []
    included_roots = [
        ROOT / "apps/web/components",
        ROOT / "apps/web/theme",
        ROOT / "apps/web/app",
    ]
    for base in included_roots:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            rel_posix = path.relative_to(ROOT).as_posix()
            if ".next" in rel_posix or "bkp" in rel_posix:
                continue
            if rel_posix.startswith("apps/web/public/") and path.suffix.lower() == ".html":
                continue
            if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".map"}:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except Exception:
                continue
            line_hits = []
            for line_no, line in enumerate(text.splitlines(), start=1):
                if blue_token_re.search(line) or blue_hex_re.search(line):
                    line_hits.append((line_no, line.strip()))
            if line_hits:
                blue_hits.append(rel_posix)
                full_path = str(path.resolve())
                for line_no, line in line_hits:
                    blue_debug_hits.append((full_path, line_no, line))

    if blue_hits:
        failures.append(f"tokens/hex azul SaaS detectados em apps/web ({len(blue_hits)} arquivo(s))")

    # 10) Depth system validation.
    banned_depth_re = re.compile(r"drop-shadow|shadow-inner")
    blue_shadow_hex_re = re.compile(r"#(?:3B82F6|2563EB|2F5BFF|3A78F2|4C8CFF|4C82FF|3A71EB|3F78F0|2E9EEA|315E9F|2A78CA)\b", flags=re.IGNORECASE)
    depth_hits: list[tuple[str, int, str]] = []
    joined_included = []
    for base in included_roots:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            rel_posix = path.relative_to(ROOT).as_posix()
            if ".next" in rel_posix or "bkp" in rel_posix:
                continue
            if rel_posix.startswith("apps/web/public/") and path.suffix.lower() == ".html":
                continue
            if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".map"}:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except Exception:
                continue
            joined_included.append(text)
            for line_no, line in enumerate(text.splitlines(), start=1):
                line_has_blue_shadow = ("shadow" in line.lower()) and bool(blue_shadow_hex_re.search(line))
                if banned_depth_re.search(line) or line_has_blue_shadow:
                    depth_hits.append((str(path.resolve()), line_no, line.strip()))

    if depth_hits:
        depth_failures.append("uso proibido de depth detectado (drop-shadow, shadow-inner ou sombra azul hardcoded)")
        failures.append(f"depth tokens inválidos detectados ({len(depth_hits)} ocorrência(s))")

    joined_scope = "\n".join(joined_included)
    required_depth_tokens = ["axiora-shadow-xs", "axiora-shadow-sm", "axiora-shadow-md"]
    missing_depth_tokens = [token for token in required_depth_tokens if token not in joined_scope]
    if missing_depth_tokens:
        depth_failures.append(f"tokens obrigatórios ausentes: {', '.join(missing_depth_tokens)}")
        failures.append("tokens de depth obrigatórios ausentes")

    # Tailwind shadow override must exist exactly in config.
    tailwind_config = read(ROOT / "apps/web/tailwind.config.ts")
    required_tailwind_shadow_lines = [
        'boxShadow: {',
        'xs: "2px 2px 4px rgba(43, 47, 66, 0.06)",',
        'sm: "4px 4px 10px rgba(43, 47, 66, 0.08)",',
        'md: "8px 8px 20px rgba(43, 47, 66, 0.10)",',
        'lg: "14px 14px 32px rgba(43, 47, 66, 0.14)",',
        '},',
    ]
    if not all(line in tailwind_config for line in required_tailwind_shadow_lines):
        depth_failures.append("tailwind boxShadow não está sobrescrito com o sistema Axiora esperado")
        failures.append("tailwind boxShadow override ausente/incorreto")

    # 11) Motion system validation.
    motion_file = ROOT / "apps/web/theme/motion.ts"
    if not motion_file.exists():
        motion_failures.append("arquivo motion.ts ausente")
        failures.append("motion.ts ausente")
    else:
        motion_text = read(motion_file)
        if "axiora-ease-soft" not in motion_text:
            motion_failures.append("axiora-ease-soft ausente em motion.ts")
            failures.append("axiora-ease-soft ausente")

    globals_css = ROOT / "apps/web/app/globals.css"
    if not globals_css.exists() or "axiora-breathing" not in read(globals_css):
        motion_failures.append("axiora-breathing ausente em globals.css")
        failures.append("axiora-breathing ausente")

    motion_banned_re = re.compile(r"\btransition-all\b|\bduration-300\b|\banimate-bounce\b")
    motion_hits: list[tuple[str, int, str]] = []
    for base in included_roots:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            rel_posix = path.relative_to(ROOT).as_posix()
            if ".next" in rel_posix or "bkp" in rel_posix:
                continue
            if rel_posix.startswith("apps/web/public/") and path.suffix.lower() == ".html":
                continue
            if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".map"}:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except Exception:
                continue
            for line_no, line in enumerate(text.splitlines(), start=1):
                if motion_banned_re.search(line):
                    motion_hits.append((str(path.resolve()), line_no, line.strip()))

    if motion_hits:
        motion_failures.append(f"tokens de motion genéricos detectados ({len(motion_hits)} ocorrência(s))")
        failures.append("motion genérico detectado")

    # 12) Atmosphere system validation.
    atmosphere_file = ROOT / "apps/web/components/ui/AxioraAtmosphere.tsx"
    layout_file = ROOT / "apps/web/app/layout.tsx"
    globals_file = ROOT / "apps/web/app/globals.css"

    atmosphere_text = ""
    layout_text = ""
    globals_text = ""

    if not atmosphere_file.exists():
        atmosphere_failures.append("AxioraAtmosphere.tsx ausente")
        failures.append("atmosphere component ausente")
    else:
        atmosphere_text = read(atmosphere_file)
        has_radial = "radial-gradient" in atmosphere_text
        has_energy_tone = ("rgba(255,107,61" in atmosphere_text) or ("var(--axiora-energy)" in atmosphere_text)
        if not (has_radial and has_energy_tone):
            atmosphere_failures.append("radial-gradient com axiora-energy não detectado")
            failures.append("atmosphere gradient inválido")

        particle_count = len(re.findall(r"\{\s*left:\s*\"[^\"]+\",\s*top:\s*\"[^\"]+\",\s*size:\s*\d+,\s*delay:\s*\"[^\"]+\"\s*\}", atmosphere_text))
        if particle_count < 4:
            atmosphere_failures.append(f"partículas insuficientes ({particle_count} encontrado, mínimo 4)")
            failures.append("atmosphere particles insuficientes")

        if re.search(r"animate-bounce|animate-spin|\bbounce\b|\bspin\b", atmosphere_text, flags=re.IGNORECASE):
            atmosphere_failures.append("animação exagerada detectada (bounce/spin)")
            failures.append("animação exagerada na atmosfera")

    if layout_file.exists():
        layout_text = read(layout_file)
    if globals_file.exists():
        globals_text = read(globals_file)

    combined_atmosphere_scope = "\n".join([atmosphere_text, layout_text, globals_text])
    if re.search(r"\.gif\b|<video\b|\.mp4\b|\.webm\b", combined_atmosphere_scope, flags=re.IGNORECASE):
        atmosphere_failures.append("gif/vídeo de fundo detectado")
        failures.append("mídia de fundo proibida detectada")

    if failures:
        print("IDENTITY V1 FAIL")
        if blue_debug_hits:
            print("BLUE_FOUND:")
            for file_path, line_no, line in blue_debug_hits:
                print(f"{file_path}:{line_no}")
                print(f"-> {line}")
        if depth_failures:
            print("DEPTH SYSTEM FAIL")
            if depth_hits:
                for file_path, line_no, line in depth_hits:
                    print(f"{file_path}:{line_no}")
                    print(f"-> {line}")
            for reason in depth_failures:
                print(f"- {reason}")
        else:
            print("DEPTH SYSTEM SAFE")
        if motion_failures:
            print("MOTION SYSTEM FAIL")
            if motion_hits:
                for file_path, line_no, line in motion_hits:
                    print(f"{file_path}:{line_no}")
                    print(f"-> {line}")
            for reason in motion_failures:
                print(f"- {reason}")
        else:
            print("MOTION SYSTEM SAFE")
        if atmosphere_failures:
            print("ATMOSPHERE SYSTEM FAIL")
            for reason in atmosphere_failures:
                print(f"- {reason}")
        else:
            print("ATMOSPHERE SYSTEM SAFE")
        for reason in failures:
            print(f"- {reason}")
        return 1

    print("DEPTH SYSTEM SAFE")
    print("MOTION SYSTEM SAFE")
    print("ATMOSPHERE SYSTEM SAFE")
    print("IDENTITY V1 PASS")
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main())
