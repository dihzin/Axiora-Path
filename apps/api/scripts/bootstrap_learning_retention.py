from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_step(label: str, command: list[str]) -> None:
    print(f"\n[bootstrap] {label}")
    print(f"[bootstrap] > {' '.join(command)}")
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> None:
    python = sys.executable
    run_step("Apply Alembic migrations", [python, "-m", "alembic", "upgrade", "head"])
    run_step("Seed seasonal events", [python, "scripts/seed_season_events.py"])
    run_step("Seed path events", [python, "scripts/seed_path_events.py"])
    print("\n[bootstrap] Learning retention bootstrap completed.")


if __name__ == "__main__":
    main()
