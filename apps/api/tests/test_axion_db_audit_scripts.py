from __future__ import annotations

from pathlib import Path
import re


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def test_audit_queries_match_expected_format() -> None:
    root = _repo_root()
    scripts = [
        root / "scripts" / "axion_db_migrate_and_audit.sh",
        root / "scripts" / "axion_db_migrate_and_audit.ps1",
    ]

    for script in scripts:
        assert script.exists(), f"Missing script: {script}"
        text = script.read_text(encoding="utf-8").lower()

        assert "alembic upgrade head" in text

        assert re.search(
            r"select\s+count\(\*\)\s+from\s+axion_decisions\s+where\s+decision_mode='policy'\s+and\s+policy_version\s+is\s+null",
            text,
            re.DOTALL,
        )
        assert re.search(
            r"select\s+count\(\*\)\s+from\s+axion_decisions\s+where\s+decision_mode='policy'\s+and\s+policy_state\s+in\s+\('shadow','rolled_back'\)",
            text,
            re.DOTALL,
        )
        assert re.search(
            r"select\s+tenant_id,\s*correlation_id,\s*count\(\*\)\s+from\s+axion_decisions\s+where\s+correlation_id\s+is\s+not\s+null\s+group\s+by\s+1,2\s+having\s+count\(\*\)\s*>\s*1",
            text,
            re.DOTALL,
        )

        assert "get_current_revision" in text
        assert "get_heads" in text
