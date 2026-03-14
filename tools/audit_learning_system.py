#!/usr/bin/env python3
"""Repository audit for Axiora APRENDER/Learn system.

Usage:
    python tools/audit_learning_system.py
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_JSON = ROOT / "learning_audit.json"
OUTPUT_TXT = ROOT / "learning_audit_report.txt"

SUPPORTED_EXTENSIONS = {".py", ".ts", ".tsx", ".json", ".yaml", ".yml"}
SKIP_DIRS = {
    ".git",
    ".next",
    ".nuxt",
    ".cache",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "test-results",
    "tmp",
    ".tmp",
    ".mypy_cache",
    ".pytest_cache",
    "__pycache__",
}

LEARNING_HINT_TERMS = {
    "learn",
    "lesson",
    "subject",
    "progress",
    "trail",
    "constellation",
    "student",
    "grade",
    "age",
    "aprender",
}

SUBJECT_CONTEXT_TERMS = {
    "subject",
    "subjects",
    "lesson",
    "lessons",
    "learn",
    "learning",
    "curriculum",
    "trail",
    "progress",
    "aprender",
    "mission",
}

CATEGORY_ORDER = [
    "subjects",
    "lesson_generators",
    "age_rules",
    "progression_system",
    "student_links",
    "api_endpoints",
    "frontend_components",
    "issues",
]


@dataclass(frozen=True)
class MatchRecord:
    file: str
    line: int
    match: str
    context: str
    kind: str

    def as_dict(self) -> Dict[str, object]:
        return {
            "file": self.file,
            "line": self.line,
            "match": self.match,
            "context": self.context,
            "kind": self.kind,
        }


class Auditor:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.records: Dict[str, Set[MatchRecord]] = {
            category: set() for category in CATEGORY_ORDER if category != "issues"
        }
        self.issues: List[str] = []
        self.files_scanned = 0

        self.subject_patterns = [
            ("subject_config", re.compile(r"\bsubjects?\b.{0,40}\b(config|map|enum|seed|catalog|curriculum|list)\b", re.IGNORECASE)),
            ("subject_config", re.compile(r"[\"\']subjects?[\"\']\s*:\s*\[", re.IGNORECASE)),
            ("subject_reference", re.compile(r"\b(math|mathematics|reading|science|language|english|portuguese|literacy|history|geography|arts?)\b", re.IGNORECASE)),
        ]

        self.lesson_patterns = [
            ("lesson_generator", re.compile(r"\b(generate_lesson|lesson_engine|create_lesson|lesson_builder|build_lesson|compose_lesson|generate.*lesson)\b", re.IGNORECASE)),
        ]

        self.age_patterns = [
            ("age_rule", re.compile(r"\b(min_age|max_age|age_group|age_range|grade|grade_level|difficulty_scal(e|ing)|difficulty_level)\b", re.IGNORECASE)),
        ]

        self.progression_patterns = [
            ("progression", re.compile(r"\b(trail|progression|constellation|lesson_path|learning_path|skill_tree|unit_path|journey|trail_node|path_node)\b", re.IGNORECASE)),
        ]

        self.student_patterns = [
            ("student_link", re.compile(r"\b(student_profile|student_progress|teacher_students|student_family_links|family_link|student_id|learner_id)\b", re.IGNORECASE)),
        ]

        self.frontend_patterns = [
            ("frontend_component", re.compile(r"\b(LearnPage|Lesson[A-Za-z0-9_]*|ProgressionMap|Learning[A-Za-z0-9_]*|Trail[A-Za-z0-9_]*)\b")),
            ("frontend_component", re.compile(r"\b(function|const|class)\s+([A-Z][A-Za-z0-9_]*)\s*(\(|=)", re.IGNORECASE)),
        ]

        self.fastapi_endpoint_re = re.compile(
            r"@(?P<router>[A-Za-z_][A-Za-z0-9_]*)\.(?P<method>get|post|put|delete|patch|api_route)\(\s*[\"\'](?P<path>[^\"\']+)",
            re.IGNORECASE,
        )
        self.fastapi_router_re = re.compile(r"\b(APIRouter|FastAPI)\s*\(", re.IGNORECASE)

    def should_skip(self, path: Path) -> bool:
        return any(part in SKIP_DIRS for part in path.parts)

    def iter_target_files(self) -> Iterable[Path]:
        for path in self.root.rglob("*"):
            if not path.is_file():
                continue
            if self.should_skip(path):
                continue
            if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            yield path

    def add_record(self, category: str, file_path: Path, line_no: int, matched_text: str, context: str, kind: str) -> None:
        record = MatchRecord(
            file=str(file_path.relative_to(self.root)).replace("\\", "/"),
            line=line_no,
            match=matched_text.strip()[:180],
            context=context.strip()[:240],
            kind=kind,
        )
        self.records[category].add(record)

    def file_has_learning_hint(self, rel_path: str, content_lower: str) -> bool:
        rel_lower = rel_path.lower()
        if any(term in rel_lower for term in LEARNING_HINT_TERMS):
            return True
        return any(term in content_lower for term in LEARNING_HINT_TERMS)

    def scan_file(self, file_path: Path) -> None:
        try:
            text = file_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return

        rel_path = str(file_path.relative_to(self.root)).replace("\\", "/")
        lines = text.splitlines()
        text_lower = text.lower()
        file_is_learning_relevant = self.file_has_learning_hint(rel_path, text_lower)

        for i, line in enumerate(lines, start=1):
            context = line.strip()
            line_lower = line.lower()

            for kind, pattern in self.subject_patterns:
                for m in pattern.finditer(line):
                    if kind == "subject_reference":
                        has_subject_context = any(token in line_lower for token in SUBJECT_CONTEXT_TERMS)
                        if not file_is_learning_relevant and not has_subject_context:
                            continue
                    self.add_record("subjects", file_path, i, m.group(0), context, kind)

            for kind, pattern in self.lesson_patterns:
                for m in pattern.finditer(line):
                    self.add_record("lesson_generators", file_path, i, m.group(0), context, kind)

            for kind, pattern in self.age_patterns:
                for m in pattern.finditer(line):
                    self.add_record("age_rules", file_path, i, m.group(0), context, kind)

            for kind, pattern in self.progression_patterns:
                for m in pattern.finditer(line):
                    if not file_is_learning_relevant and "lesson_path" not in line_lower:
                        continue
                    self.add_record("progression_system", file_path, i, m.group(0), context, kind)

            for kind, pattern in self.student_patterns:
                for m in pattern.finditer(line):
                    self.add_record("student_links", file_path, i, m.group(0), context, kind)

            endpoint_match = self.fastapi_endpoint_re.search(line)
            if endpoint_match:
                method = endpoint_match.group("method").lower()
                endpoint_path = endpoint_match.group("path")
                if self.file_has_learning_hint(rel_path, text_lower) or any(
                    term in endpoint_path.lower()
                    for term in ["learn", "lesson", "subject", "progress", "student", "trail"]
                ):
                    self.add_record(
                        "api_endpoints",
                        file_path,
                        i,
                        f"{method.upper()} {endpoint_path}",
                        context,
                        "fastapi_endpoint",
                    )

            if self.fastapi_router_re.search(line) and file_is_learning_relevant:
                self.add_record("api_endpoints", file_path, i, line.strip(), context, "fastapi_router")

            if file_path.suffix.lower() in {".ts", ".tsx"}:
                for kind, pattern in self.frontend_patterns:
                    for m in pattern.finditer(line):
                        if kind == "frontend_component" and "function" in m.group(0).lower():
                            component_name = m.group(2) if m.lastindex and m.lastindex >= 2 else m.group(0)
                            if component_name and component_name[0].isupper():
                                if self.file_has_learning_hint(rel_path, text_lower) or any(
                                    token in component_name.lower()
                                    for token in ["learn", "lesson", "progress", "trail", "subject"]
                                ):
                                    self.add_record("frontend_components", file_path, i, component_name, context, "react_component")
                        else:
                            if file_is_learning_relevant or any(
                                token in m.group(0).lower()
                                for token in ["learn", "lesson", "progress", "trail", "subject"]
                            ):
                                self.add_record("frontend_components", file_path, i, m.group(0), context, kind)

    def collect_issues(self) -> None:
        checks: List[Tuple[str, str]] = [
            ("lesson_generators", "no lesson generator found"),
            ("subjects", "no subject configuration found"),
            ("progression_system", "no progression system found"),
        ]
        for key, message in checks:
            if not self.records.get(key):
                self.issues.append(message)

    def sorted_dicts(self, category: str) -> List[Dict[str, object]]:
        return [
            record.as_dict()
            for record in sorted(
                self.records[category], key=lambda r: (r.file, r.line, r.match, r.kind)
            )
        ]

    def build_payload(self) -> Dict[str, object]:
        payload: Dict[str, object] = {}
        for category in CATEGORY_ORDER:
            if category == "issues":
                payload[category] = self.issues
            else:
                payload[category] = self.sorted_dicts(category)
        return payload

    def write_reports(self) -> Dict[str, object]:
        payload = self.build_payload()
        OUTPUT_JSON.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        OUTPUT_TXT.write_text(self.build_human_report(payload), encoding="utf-8")
        return payload

    def build_human_report(self, payload: Dict[str, object]) -> str:
        lines: List[str] = []
        lines.append("Axiora Path - APRENDER Learning System Audit")
        lines.append("=" * 48)
        lines.append(f"Repository: {self.root}")
        lines.append(f"Files scanned: {self.files_scanned}")
        lines.append("")

        for category in CATEGORY_ORDER:
            title = category.replace("_", " ").title()
            if category == "issues":
                issues = payload[category]
                lines.append(f"{title} ({len(issues)}):")
                if issues:
                    for item in issues:
                        lines.append(f"- {item}")
                else:
                    lines.append("- None")
                lines.append("")
                continue

            entries: List[Dict[str, object]] = payload[category]  # type: ignore[assignment]
            lines.append(f"{title} ({len(entries)}):")
            if not entries:
                lines.append("- None")
                lines.append("")
                continue

            for entry in entries[:150]:
                lines.append(
                    f"- {entry['file']}:{entry['line']} [{entry['kind']}] {entry['match']}"
                )
            if len(entries) > 150:
                lines.append(f"- ... {len(entries) - 150} additional matches omitted")
            lines.append("")

        return "\n".join(lines).rstrip() + "\n"

    def run(self) -> Dict[str, object]:
        for file_path in self.iter_target_files():
            self.files_scanned += 1
            self.scan_file(file_path)

        self.collect_issues()
        payload = self.write_reports()
        self.print_terminal_summary(payload)
        return payload

    def print_terminal_summary(self, payload: Dict[str, object]) -> None:
        subjects_count = len(payload["subjects"])  # type: ignore[arg-type]
        lesson_gen_count = len(payload["lesson_generators"])  # type: ignore[arg-type]
        progression_count = len(payload["progression_system"])  # type: ignore[arg-type]

        print("Learning system audit complete")
        print(f"Files scanned: {self.files_scanned}")
        print(f"Subjects detected: {subjects_count}")
        print(f"Lesson generators detected: {lesson_gen_count}")
        print(f"Progression systems detected: {progression_count}")
        print(f"JSON report: {OUTPUT_JSON}")
        print(f"Text report: {OUTPUT_TXT}")


def main() -> int:
    auditor = Auditor(ROOT)
    auditor.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
