from __future__ import annotations

from pathlib import Path


def _script_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "scripts" / "security_audit.py").read_text(encoding="utf-8")


def test_security_audit_script_exists_and_covers_core_checks() -> None:
    source = _script_source()

    assert "def run_audit(" in source
    assert "_scan_hardcoded_secrets" in source
    assert "_scan_dangerous_execution" in source
    assert "_scan_sql_injection_risks" in source
    assert "_scan_insecure_config" in source
    assert "_scan_tenant_isolation_heuristics" in source
    assert "_scan_missing_csrf_middleware" in source
    assert "--out-json" in source
    assert "--out-md" in source
    assert "docs/security_audit_report.json" in source
    assert "docs/security_audit_report.md" in source
