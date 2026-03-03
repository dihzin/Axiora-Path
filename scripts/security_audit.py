from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
import json
from pathlib import Path
import re
from typing import Iterable


SEVERITY_ORDER = ("CRITICAL", "HIGH", "MEDIUM", "LOW")
SEVERITY_RANK = {level: idx for idx, level in enumerate(SEVERITY_ORDER)}
MIN_FAIL_LEVELS: dict[str, set[str]] = {
    "none": set(),
    "medium": {"CRITICAL", "HIGH", "MEDIUM"},
    "high": {"CRITICAL", "HIGH"},
    "critical": {"CRITICAL"},
}

SKIP_DIRS = {
    ".git",
    ".next",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    ".mypy_cache",
    ".pytest_cache",
    "docs",
}

TEXT_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".yml",
    ".yaml",
    ".env",
    ".ini",
    ".toml",
    ".sh",
    ".ps1",
}


@dataclass(slots=True)
class Finding:
    rule_id: str
    severity: str
    category: str
    file: str
    line: int
    message: str
    evidence: str
    remediation: str


def _is_text_file(path: Path) -> bool:
    if path.suffix.lower() in TEXT_EXTENSIONS:
        return True
    return path.name in {".env", ".env.example"}


def _iter_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if path.is_dir():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if not _is_text_file(path):
            continue
        yield path


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="ignore")


def _line_number(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1


def _snippet(text: str, idx: int, max_len: int = 180) -> str:
    line_start = text.rfind("\n", 0, idx)
    line_end = text.find("\n", idx)
    if line_start < 0:
        line_start = 0
    else:
        line_start += 1
    if line_end < 0:
        line_end = len(text)
    out = text[line_start:line_end].strip()
    return out[:max_len]


def _scan_hardcoded_secrets(path: Path, text: str, findings: list[Finding]) -> None:
    patterns = [
        (
            "secret.aws_access_key",
            re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
            "AWS access key appears hardcoded.",
        ),
        (
            "secret.private_key_block",
            re.compile(r"-----BEGIN (?:RSA|EC|OPENSSH|PRIVATE) KEY-----"),
            "Private key material appears in repository.",
        ),
        (
            "secret.token_assignment",
            re.compile(r"(?i)\b(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{12,}['\"]"),
            "Potential hardcoded credential/token assignment.",
        ),
    ]
    for rule_id, pattern, message in patterns:
        for match in pattern.finditer(text):
            findings.append(
                Finding(
                    rule_id=rule_id,
                    severity="HIGH",
                    category="Secrets",
                    file=str(path),
                    line=_line_number(text, match.start()),
                    message=message,
                    evidence=_snippet(text, match.start()),
                    remediation="Move secret to environment/secret manager and rotate leaked credentials.",
                )
            )


def _scan_dangerous_execution(path: Path, text: str, findings: list[Finding]) -> None:
    patterns = [
        (
            "exec.eval",
            re.compile(r"\beval\s*\("),
            "Use of eval() introduces arbitrary code execution risk.",
            "CRITICAL",
        ),
        (
            "exec.exec",
            re.compile(r"\bexec\s*\("),
            "Use of exec() introduces arbitrary code execution risk.",
            "CRITICAL",
        ),
        (
            "exec.pickle_loads",
            re.compile(r"\bpickle\.loads?\s*\("),
            "pickle deserialization can execute arbitrary code.",
            "HIGH",
        ),
        (
            "exec.subprocess_shell_true",
            re.compile(r"\bsubprocess\.(?:run|Popen|call|check_call|check_output)\([^)]*shell\s*=\s*True", re.DOTALL),
            "subprocess call with shell=True increases command injection risk.",
            "HIGH",
        ),
    ]
    for rule_id, pattern, message, severity in patterns:
        for match in pattern.finditer(text):
            findings.append(
                Finding(
                    rule_id=rule_id,
                    severity=severity,
                    category="Code Execution",
                    file=str(path),
                    line=_line_number(text, match.start()),
                    message=message,
                    evidence=_snippet(text, match.start()),
                    remediation="Use safer alternatives and strict input validation/escaping.",
                )
            )


def _scan_sql_injection_risks(path: Path, text: str, findings: list[Finding]) -> None:
    patterns = [
        (
            "sql.fstring_execute",
            re.compile(r"\b(?:execute|text)\s*\(\s*f['\"]"),
            "Potential SQL built via f-string. Prefer bound parameters.",
        ),
        (
            "sql.format_execute",
            re.compile(r"\b(?:execute|text)\s*\(\s*['\"].*?\{.*?\}.*?['\"]\s*\.format\(", re.DOTALL),
            "Potential SQL string formatting detected. Prefer bound parameters.",
        ),
    ]
    for rule_id, pattern, message in patterns:
        for match in pattern.finditer(text):
            findings.append(
                Finding(
                    rule_id=rule_id,
                    severity="HIGH",
                    category="Injection",
                    file=str(path),
                    line=_line_number(text, match.start()),
                    message=message,
                    evidence=_snippet(text, match.start()),
                    remediation="Use parameterized SQLAlchemy queries with bind params.",
                )
            )


def _scan_insecure_config(path: Path, text: str, findings: list[Finding]) -> None:
    checks = [
        (
            "config.cors_wildcard",
            re.compile(r"allow_origins\s*=\s*\[\s*['\"]\*['\"]\s*\]"),
            "CORS wildcard origin configured.",
            "MEDIUM",
        ),
        (
            "config.cookie_secure_false",
            re.compile(r"auth_cookie_secure\s*:\s*bool\s*=\s*False"),
            "Secure cookie disabled by default.",
            "HIGH",
        ),
        (
            "config.jwt_algo_none",
            re.compile(r"algorithm\s*=\s*['\"]none['\"]", re.IGNORECASE),
            "JWT algorithm set to none.",
            "CRITICAL",
        ),
    ]
    for rule_id, pattern, message, severity in checks:
        for match in pattern.finditer(text):
            findings.append(
                Finding(
                    rule_id=rule_id,
                    severity=severity,
                    category="Configuration",
                    file=str(path),
                    line=_line_number(text, match.start()),
                    message=message,
                    evidence=_snippet(text, match.start()),
                    remediation="Harden configuration with explicit secure defaults.",
                )
            )


def _scan_sensitive_logging(path: Path, text: str, findings: list[Finding]) -> None:
    sensitive_tokens = ("password", "pin", "token", "secret", "refresh_token", "authorization")
    pattern = re.compile(r"\b(?:logger\.(?:info|warning|error|exception|debug)|print)\s*\((?P<body>.*?)\)", re.DOTALL)
    for match in pattern.finditer(text):
        body = match.group("body").lower()
        if any(token in body for token in sensitive_tokens):
            findings.append(
                Finding(
                    rule_id="logging.sensitive_fields",
                    severity="MEDIUM",
                    category="Logging",
                    file=str(path),
                    line=_line_number(text, match.start()),
                    message="Potential sensitive field written to logs.",
                    evidence=_snippet(text, match.start()),
                    remediation="Remove or mask sensitive fields before logging.",
                )
            )


def _scan_weak_hashes(path: Path, text: str, findings: list[Finding]) -> None:
    for token in ("hashlib.md5(", "hashlib.sha1("):
        idx = text.find(token)
        while idx >= 0:
            findings.append(
                Finding(
                    rule_id="crypto.weak_hash",
                    severity="LOW",
                    category="Cryptography",
                    file=str(path),
                    line=_line_number(text, idx),
                    message="Weak hash function usage detected (MD5/SHA1).",
                    evidence=_snippet(text, idx),
                    remediation="Use SHA-256+ or dedicated password hashing (bcrypt/argon2) depending on purpose.",
                )
            )
            idx = text.find(token, idx + 1)


def _scan_tenant_isolation_heuristics(path: Path, text: str, findings: list[Finding]) -> None:
    if "apps/api/app/api/routes" not in str(path).replace("\\", "/"):
        return
    # Heuristic: ChildProfile lookup by id without tenant guard in same where clause.
    pattern = re.compile(r"select\(ChildProfile\)\.where\((?P<body>.*?)\)\s*,", re.DOTALL)
    for match in pattern.finditer(text):
        body = match.group("body")
        if "ChildProfile.id ==" in body and "ChildProfile.tenant_id ==" not in body:
            findings.append(
                Finding(
                    rule_id="tenant.child_query_missing_tenant",
                    severity="HIGH",
                    category="Tenant Isolation",
                    file=str(path),
                    line=_line_number(text, match.start()),
                    message="ChildProfile query by id may be missing tenant filter.",
                    evidence=" ".join(body.strip().split())[:180],
                    remediation="Enforce tenant_id condition in all child-scoped queries.",
                )
            )


def _scan_missing_csrf_middleware(root: Path, findings: list[Finding]) -> None:
    main_path = root / "apps" / "api" / "app" / "main.py"
    if not main_path.exists():
        return
    text = _read_text(main_path)
    if "CSRFMiddleware" not in text or "app.add_middleware(CSRFMiddleware)" not in text:
        findings.append(
            Finding(
                rule_id="csrf.middleware_missing",
                severity="HIGH",
                category="CSRF",
                file=str(main_path),
                line=1,
                message="CSRF middleware not detected in API bootstrap.",
                evidence="CSRFMiddleware registration not found.",
                remediation="Register CSRF middleware in app startup for state-changing endpoints.",
            )
        )


def run_audit(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    self_file = Path(__file__).resolve()
    for path in _iter_files(root):
        if path.resolve() == self_file:
            continue
        text = _read_text(path)
        _scan_hardcoded_secrets(path, text, findings)
        _scan_dangerous_execution(path, text, findings)
        _scan_sql_injection_risks(path, text, findings)
        _scan_insecure_config(path, text, findings)
        _scan_sensitive_logging(path, text, findings)
        _scan_weak_hashes(path, text, findings)
        _scan_tenant_isolation_heuristics(path, text, findings)
    _scan_missing_csrf_middleware(root, findings)
    findings.sort(
        key=lambda item: (
            SEVERITY_RANK.get(item.severity, 99),
            item.category,
            item.file,
            item.line,
            item.rule_id,
        )
    )
    return findings


def _summary(findings: list[Finding]) -> dict[str, object]:
    by_severity = Counter(item.severity for item in findings)
    by_category = Counter(item.category for item in findings)
    by_rule = Counter(item.rule_id for item in findings)
    return {
        "total_findings": len(findings),
        "by_severity": {k: by_severity.get(k, 0) for k in SEVERITY_ORDER},
        "by_category": dict(sorted(by_category.items(), key=lambda kv: (-kv[1], kv[0]))),
        "top_rules": dict(sorted(by_rule.items(), key=lambda kv: (-kv[1], kv[0]))[:15]),
    }


def _to_markdown(root: Path, findings: list[Finding]) -> str:
    summary = _summary(findings)
    now = datetime.now(UTC).isoformat()
    lines: list[str] = [
        "# Security Audit Report",
        "",
        f"- Generated at: `{now}`",
        f"- Root: `{root}`",
        f"- Total findings: **{summary['total_findings']}**",
        "",
        "## Severity",
        "",
    ]
    sev = summary["by_severity"]
    for level in SEVERITY_ORDER:
        lines.append(f"- {level}: {sev.get(level, 0)}")
    lines.extend(["", "## Category", ""])
    for category, count in summary["by_category"].items():
        lines.append(f"- {category}: {count}")
    lines.extend(["", "## Findings", ""])
    if not findings:
        lines.append("- No findings.")
        return "\n".join(lines)

    grouped: dict[str, list[Finding]] = defaultdict(list)
    for item in findings:
        grouped[item.severity].append(item)
    for level in SEVERITY_ORDER:
        bucket = grouped.get(level, [])
        if not bucket:
            continue
        lines.append(f"### {level}")
        lines.append("")
        for item in bucket:
            lines.append(f"- `{item.rule_id}` [{item.file}:{item.line}]")
            lines.append(f"  - Message: {item.message}")
            lines.append(f"  - Evidence: `{item.evidence}`")
            lines.append(f"  - Remediation: {item.remediation}")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Static security auditor for Axiora codebase.")
    parser.add_argument("--root", default=".", help="Repository root directory.")
    parser.add_argument(
        "--out-json",
        default="docs/security_audit_report.json",
        help="Path to write JSON report.",
    )
    parser.add_argument(
        "--out-md",
        default="docs/security_audit_report.md",
        help="Path to write Markdown report.",
    )
    parser.add_argument(
        "--fail-on",
        choices=("none", "medium", "high", "critical"),
        default="high",
        help="Exit non-zero if finding at/above this severity exists.",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    findings = run_audit(root)
    summary = _summary(findings)

    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)

    json_payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "root": str(root),
        "summary": summary,
        "findings": [asdict(item) for item in findings],
    }
    out_json.write_text(json.dumps(json_payload, indent=2, ensure_ascii=False), encoding="utf-8")
    out_md.write_text(_to_markdown(root, findings), encoding="utf-8")

    fail_levels = MIN_FAIL_LEVELS[args.fail_on]
    should_fail = any(item.severity in fail_levels for item in findings)
    print(f"[security-audit] findings={len(findings)} out_json={out_json} out_md={out_md}")
    if should_fail:
        print(f"[security-audit] status=FAILED fail_on={args.fail_on}")
        return 1
    print("[security-audit] status=PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
