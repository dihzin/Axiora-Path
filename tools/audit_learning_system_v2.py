#!/usr/bin/env python3
"""Semantic architecture auditor for Axiora APRENDER/Learn system.

Usage:
    python tools/audit_learning_system_v2.py
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_JSON = ROOT / "learning_audit_v2.json"
OUTPUT_TXT = ROOT / "learning_audit_v2_report.txt"
OUTPUT_GRAPH = ROOT / "learning_graph.json"
IGNORED_FILES = {
    "learning_audit.json",
    "learning_audit_report.txt",
    "learning_audit_v2.json",
    "learning_audit_v2_report.txt",
    "learning_graph.json",
}
IGNORED_FILE_PREFIXES = {"audit_learning_system"}

SUPPORTED_EXTENSIONS = {".py", ".ts", ".tsx", ".json", ".yaml", ".yml"}
SKIP_DIRS = {
    ".git", ".next", ".nuxt", ".cache", ".venv", "venv", "env", "node_modules",
    "dist", "build", "coverage", "test-results", "tmp", ".tmp", ".mypy_cache",
    ".pytest_cache", "__pycache__",
}

CANONICAL_SUBJECTS = {
    "math", "reading", "science", "language", "english", "portuguese", "history", "geography",
}

KNOWN_SKILLS = {
    "addition", "subtraction", "multiplication", "division", "fractions", "decimals", "algebra",
    "geometry", "phonics", "spelling", "vocabulary", "grammar", "reading_comprehension",
    "comprehension", "writing", "interpretation", "problem_solving",
}

LEARNING_TERMS = {
    "learn", "learning", "lesson", "subject", "skill", "progress", "trail", "constellation",
    "curriculum", "student", "aprender", "mastery",
}

ENTITY_ORDER = [
    "subjects", "skills", "lessons", "lesson_generators", "age_rules", "progression_nodes",
    "student_links", "api_routes", "frontend_components",
]

RELATION_TYPES = [
    "subject_to_skill", "skill_to_lesson", "lesson_to_generator", "lesson_to_progression_node",
    "progression_node_to_frontend", "lesson_to_api_route", "student_progress_to_lesson",
]


@dataclass(frozen=True)
class Finding:
    entity_type: str
    name: str
    file: str
    line: int
    confidence: float
    source_of_truth: str
    snippet: str
    evidence: str
    metadata: Tuple[Tuple[str, str], ...] = field(default_factory=tuple)

    @property
    def key(self) -> Tuple[str, str, str, int, str]:
        return (self.entity_type, self.name.lower(), self.file, self.line, self.source_of_truth)

    def to_dict(self) -> Dict[str, Any]:
        out = {
            "entity": self.entity_type,
            "name": self.name,
            "file": self.file,
            "line": self.line,
            "confidence": round(self.confidence, 3),
            "source_of_truth": self.source_of_truth,
            "snippet": self.snippet,
            "evidence": self.evidence,
        }
        if self.metadata:
            out["metadata"] = {k: v for k, v in self.metadata}
        return out


@dataclass(frozen=True)
class Relation:
    relation_type: str
    from_type: str
    from_name: str
    to_type: str
    to_name: str
    file: str
    evidence: str
    confidence: float

    @property
    def key(self) -> Tuple[str, str, str, str, str, str]:
        return (self.relation_type, self.from_type, self.from_name.lower(), self.to_type, self.to_name.lower(), self.file)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "relation": self.relation_type,
            "from": {"type": self.from_type, "name": self.from_name},
            "to": {"type": self.to_type, "name": self.to_name},
            "file": self.file,
            "evidence": self.evidence,
            "confidence": round(self.confidence, 3),
        }


class LearningArchitectureAuditor:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.files_scanned = 0
        self.findings: Dict[str, Dict[Tuple[str, str, str, int, str], Finding]] = {key: {} for key in ENTITY_ORDER}
        self.relations: Dict[Tuple[str, str, str, str, str, str], Relation] = {}
        self.issues: List[Dict[str, Any]] = []

        self.route_logic: Dict[Tuple[str, str, int], bool] = {}
        self.component_api_source: Dict[Tuple[str, str, int], bool] = {}
        self.student_persistence: Dict[Tuple[str, str, int], bool] = {}

        self.subject_re = re.compile(r"\b(math|reading|science|language|english|portuguese|history|geography)\b", re.IGNORECASE)
        self.skill_keyval_re = re.compile(r"[\"']?(skill(?:_id|_name|s)?)[\"']?\s*[:=]\s*[\"']([^\"']{2,80})[\"']", re.IGNORECASE)
        self.skill_known_re = re.compile(r"\b(" + "|".join(re.escape(s) for s in sorted(KNOWN_SKILLS, key=len, reverse=True)) + r")\b", re.IGNORECASE)
        self.lesson_re = re.compile(r"\b(lesson(?:_template|_definition|_id|_path)?|activity|exercise)\b", re.IGNORECASE)
        self.lesson_name_re = re.compile(r"\b(?:def|class|const|let|var|function)\s+([A-Za-z_][A-Za-z0-9_]*lesson[A-Za-z0-9_]*)\b", re.IGNORECASE)
        self.generator_re = re.compile(r"\b(generate_lesson|lesson_engine|lesson_builder|create_lesson|build_lesson|compose_lesson)\b", re.IGNORECASE)
        self.generator_def_re = re.compile(r"\b(?:def|class|const|let|var|function)\s+([A-Za-z_][A-Za-z0-9_]*(?:generate|builder|engine|lesson)[A-Za-z0-9_]*)\b", re.IGNORECASE)
        self.age_re = re.compile(r"\b(min_age|max_age|age_group|age|grade(?:_level)?|difficulty|level)\b", re.IGNORECASE)
        self.progression_re = re.compile(r"\b(trail|progression|constellation|lesson_path|learning_path|path_node|trail_node|node_id|node)\b", re.IGNORECASE)
        self.student_re = re.compile(r"\b(student_progress|student_profile|student_learning_state|teacher_students|student_family_links|student_id|learner_id|mastery)\b", re.IGNORECASE)
        self.fastapi_route_re = re.compile(r"@(?P<router>[A-Za-z_][A-Za-z0-9_]*)\.(?P<method>get|post|put|delete|patch|api_route)\(\s*[\"'](?P<path>[^\"']+)", re.IGNORECASE)
        self.fastapi_router_re = re.compile(r"\b(APIRouter|FastAPI)\s*\(")
        self.frontend_component_re = re.compile(r"\b(?:export\s+default\s+function|export\s+function|function|const)\s+([A-Z][A-Za-z0-9_]*)\b")
        self.frontend_named_targets = re.compile(r"\b(LearnPage|LessonView|ProgressionMap|SkillCard|LessonCard)\b")
        self.api_client_re = re.compile(r"\b(fetch|axios\.|useQuery|useSWR|apiClient\.|httpClient\.)\b|/api/|/learn|/lesson|/subjects|/progress|/skills", re.IGNORECASE)

    def iter_files(self) -> Iterable[Path]:
        for path in self.root.rglob("*"):
            if not path.is_file():
                continue
            if path.name in IGNORED_FILES:
                continue
            if any(path.name.startswith(prefix) for prefix in IGNORED_FILE_PREFIXES):
                continue
            if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            yield path

    def normalize_path(self, path: Path) -> str:
        return str(path.relative_to(self.root)).replace("\\", "/")

    def classify_source(self, rel_path: str) -> str:
        lower = rel_path.lower()
        if "/test" in lower or lower.startswith("tests/") or "_test." in lower or "test_" in lower:
            return "test_only"
        if "mock" in lower or "fixtures" in lower or "fake" in lower:
            return "mock_only"
        if lower.endswith((".tsx", ".ts")) and ("apps/web" in lower or "/components/" in lower or "/ui/" in lower):
            return "ui_reference"
        if any(tok in lower for tok in ["curriculum", "catalog", "seed", "config", "schema", "constants", "yaml", "yml", ".json"]):
            return "canonical_config"
        if any(tok in lower for tok in ["api/routes", "/services/", "/core/", "engine", "app/api", "models", "repositories"]):
            return "runtime_logic"
        return "unknown"

    def is_learning_file(self, rel_path: str, text_lower: str) -> bool:
        lower = rel_path.lower()
        if any(tok in lower for tok in LEARNING_TERMS):
            return True
        return any(tok in text_lower for tok in LEARNING_TERMS)

    def line_snippet(self, line: str) -> str:
        return line.strip()[:220]

    def add_finding(
        self,
        entity_type: str,
        name: str,
        rel_path: str,
        line: int,
        confidence: float,
        source: str,
        snippet: str,
        evidence: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> None:
        clean_name = (name or "").strip().strip('"\'`')
        if not clean_name:
            return
        bounded_conf = max(0.0, min(1.0, confidence))
        if source == "test_only":
            bounded_conf = min(bounded_conf, 0.6)
        elif source == "mock_only":
            bounded_conf = min(bounded_conf, 0.55)
        elif source == "ui_reference":
            bounded_conf = min(bounded_conf, 0.78)
        finding = Finding(
            entity_type=entity_type,
            name=clean_name,
            file=rel_path,
            line=line,
            confidence=bounded_conf,
            source_of_truth=source,
            snippet=snippet,
            evidence=evidence,
            metadata=tuple(sorted((metadata or {}).items())),
        )
        self.findings[entity_type][finding.key] = finding

    def scan_file(self, path: Path) -> None:
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return

        rel = self.normalize_path(path)
        source = self.classify_source(rel)
        lines = text.splitlines()
        lower = text.lower()
        learning_file = self.is_learning_file(rel, lower)
        if not learning_file:
            return

        for i, line in enumerate(lines, 1):
            snippet = self.line_snippet(line)
            line_lower = line.lower()
            context_boost = 0.05 if any(t in line_lower for t in ["lesson", "skill", "subject", "progress", "trail", "aprender"]) else 0.0

            for m in self.subject_re.finditer(line):
                subject = m.group(1).lower()
                conf = 0.9 if any(k in line_lower for k in ["subjects", "curriculum", "catalog", "taxonomy"]) else 0.72
                if source in {"ui_reference", "test_only", "mock_only"}:
                    conf -= 0.1
                self.add_finding("subjects", subject, rel, i, conf + context_boost, source, snippet, "subject_token_match")

            for m in self.skill_keyval_re.finditer(line):
                key = m.group(1)
                skill_name = m.group(2).strip().lower().replace(" ", "_")
                self.add_finding("skills", skill_name, rel, i, 0.93 + context_boost, source, snippet, "skill_key_value", {"key": key.lower()})
            for m in self.skill_known_re.finditer(line):
                sk = m.group(1).lower().replace(" ", "_")
                conf = 0.84 if ("skill" in line_lower or "mastery" in line_lower or "curriculum" in line_lower) else 0.68
                if source in {"ui_reference", "test_only", "mock_only"}:
                    conf -= 0.1
                self.add_finding("skills", sk, rel, i, conf + context_boost, source, snippet, "known_skill_match")

            for m in self.lesson_re.finditer(line):
                lesson_name = m.group(1).lower()
                conf = 0.82 if any(k in line_lower for k in ["lesson_template", "lesson_definition", "exercise", "activity", "lesson_id"]) else 0.7
                self.add_finding("lessons", lesson_name, rel, i, conf + context_boost, source, snippet, "lesson_structure_token")
            for m in self.lesson_name_re.finditer(line):
                self.add_finding("lessons", m.group(1), rel, i, 0.9 + context_boost, source, snippet, "lesson_symbol_definition")

            for m in self.generator_re.finditer(line):
                conf = 0.95 if any(tok in line_lower for tok in ["def ", "class ", "function ", "const "]) else 0.79
                self.add_finding("lesson_generators", m.group(1), rel, i, conf + context_boost, source, snippet, "lesson_generator_match")
            for m in self.generator_def_re.finditer(line):
                name = m.group(1)
                if any(tok in name.lower() for tok in ["lesson", "engine", "builder", "generate"]):
                    self.add_finding("lesson_generators", name, rel, i, 0.9 + context_boost, source, snippet, "generator_symbol_definition")

            for m in self.age_re.finditer(line):
                token = m.group(1).lower()
                conf = 0.9 if token in {"min_age", "max_age", "age_group", "grade", "grade_level", "difficulty"} else 0.7
                self.add_finding("age_rules", token, rel, i, conf + context_boost, source, snippet, "age_grade_mapping_token")

            for m in self.progression_re.finditer(line):
                token = m.group(1).lower()
                conf = 0.88 if token in {"trail", "progression", "constellation", "lesson_path", "learning_path", "path_node", "trail_node"} else 0.65
                self.add_finding("progression_nodes", token, rel, i, conf + context_boost, source, snippet, "progression_token")

            for m in self.student_re.finditer(line):
                token = m.group(1).lower()
                conf = 0.9 if token in {"student_progress", "student_profile", "student_learning_state", "teacher_students", "student_family_links"} else 0.7
                self.add_finding("student_links", token, rel, i, conf + context_boost, source, snippet, "student_learning_link_token")

            route_match = self.fastapi_route_re.search(line)
            if route_match:
                method = route_match.group("method").upper()
                route = route_match.group("path")
                route_name = f"{method} {route}"
                learning_route = any(t in route.lower() for t in ["learn", "lesson", "subject", "progress", "skill", "trail", "student"]) or "aprender" in rel.lower()
                if learning_route:
                    self.add_finding("api_routes", route_name, rel, i, 0.96, "runtime_logic", snippet, "fastapi_learning_route")
                    self.route_logic[(rel, route_name, i)] = self.route_has_backend_logic(lines, i)

            if self.fastapi_router_re.search(line) and learning_file:
                self.add_finding("api_routes", "router", rel, i, 0.72, "runtime_logic", snippet, "fastapi_router_reference")

            if path.suffix.lower() in {".ts", ".tsx"}:
                for m in self.frontend_named_targets.finditer(line):
                    component = m.group(1)
                    self.add_finding("frontend_components", component, rel, i, 0.95, "ui_reference", snippet, "named_learning_component")
                    self.component_api_source[(rel, component, i)] = self.component_has_api_source(lines, i)
                for m in self.frontend_component_re.finditer(line):
                    component = m.group(1)
                    if any(k in component.lower() for k in ["learn", "lesson", "progress", "skill", "trail", "node", "subject"]):
                        self.add_finding("frontend_components", component, rel, i, 0.82, "ui_reference", snippet, "frontend_component_definition")
                        self.component_api_source[(rel, component, i)] = self.component_has_api_source(lines, i)

        self.track_student_persistence(rel, lines)

    def route_has_backend_logic(self, lines: List[str], route_line: int) -> bool:
        start = route_line
        end = min(len(lines), route_line + 30)
        window = "\n".join(lines[start:end]).lower()
        if any(tok in window for tok in ["service", "repository", "crud", "db", "session", "select(", "insert(", "update(", "delete(", "await "]):
            return True
        if re.search(r"return\s+\{", window) and "mock" in window:
            return False
        if "pass" in window:
            return False
        return "return" in window and any(tok in window for tok in ["response", "result", "payload"])

    def component_has_api_source(self, lines: List[str], comp_line: int) -> bool:
        start = max(0, comp_line - 1)
        end = min(len(lines), comp_line + 90)
        window = "\n".join(lines[start:end])
        return bool(self.api_client_re.search(window))

    def track_student_persistence(self, rel: str, lines: List[str]) -> None:
        full = "\n".join(lines).lower()
        has_student = any(t in full for t in ["student_progress", "student_profile", "student_learning_state", "mastery", "teacher_students"])
        if not has_student:
            return
        persistence = any(tok in full for tok in ["sqlalchemy", "mapped", "column(", "table", "session", "commit(", "insert(", "update(", "upsert", "redis", "persist", "repository"])
        self.student_persistence[(rel, "student_progress", 0)] = persistence

    def add_relation(self, relation_type: str, from_finding: Finding, to_finding: Finding, file: str, evidence: str) -> None:
        conf = min(from_finding.confidence, to_finding.confidence)
        rel = Relation(relation_type, from_finding.entity_type, from_finding.name, to_finding.entity_type, to_finding.name, file, evidence[:220], conf)
        self.relations[rel.key] = rel

    def build_relationships(self) -> None:
        by_file: Dict[str, Dict[str, List[Finding]]] = defaultdict(lambda: defaultdict(list))
        for etype in ENTITY_ORDER:
            for f in self.findings[etype].values():
                if f.confidence >= 0.58:
                    by_file[f.file][etype].append(f)

        for file, cat in by_file.items():
            self.relate_nearby(file, cat, "subjects", "skills", "subject_to_skill", 40)
            self.relate_nearby(file, cat, "skills", "lessons", "skill_to_lesson", 40)
            self.relate_nearby(file, cat, "lessons", "lesson_generators", "lesson_to_generator", 50)
            self.relate_nearby(file, cat, "lessons", "progression_nodes", "lesson_to_progression_node", 50)
            self.relate_nearby(file, cat, "progression_nodes", "frontend_components", "progression_node_to_frontend", 80)
            self.relate_nearby(file, cat, "lessons", "api_routes", "lesson_to_api_route", 80)
            self.relate_nearby(file, cat, "student_links", "lessons", "student_progress_to_lesson", 100)

    def relate_nearby(self, file: str, cat: Dict[str, List[Finding]], from_type: str, to_type: str, relation_type: str, max_line_gap: int) -> None:
        from_items = sorted(cat.get(from_type, []), key=lambda x: x.line)
        to_items = sorted(cat.get(to_type, []), key=lambda x: x.line)
        if not from_items or not to_items:
            return
        for left in from_items:
            for right in to_items:
                gap = abs(left.line - right.line)
                if gap <= max_line_gap:
                    ev = f"line_gap={gap}; {left.snippet} || {right.snippet}"
                    self.add_relation(relation_type, left, right, file, ev)

    def collect_issues(self) -> None:
        subject_names = [f.name.lower() for f in self.findings["subjects"].values() if f.confidence >= 0.7 and f.source_of_truth != "test_only"]
        skill_names = [f.name.lower() for f in self.findings["skills"].values() if f.confidence >= 0.7 and f.source_of_truth not in {"test_only", "mock_only"}]
        generator_names = [f.name.lower() for f in self.findings["lesson_generators"].values() if f.confidence >= 0.75 and f.source_of_truth != "test_only"]
        progression_names = [f.name.lower() for f in self.findings["progression_nodes"].values() if f.confidence >= 0.75 and f.source_of_truth not in {"test_only", "mock_only"}]

        rel_pairs = defaultdict(set)
        for rel in self.relations.values():
            rel_pairs[rel.relation_type].add((rel.from_name.lower(), rel.to_name.lower()))

        for subject in sorted(set(subject_names)):
            if not any(a == subject for a, _ in rel_pairs["subject_to_skill"]):
                self.issue("subject_without_skills", f"Subject '{subject}' has no detected skill link", "medium")

        for skill in sorted(set(skill_names)):
            if not any(a == skill for a, _ in rel_pairs["skill_to_lesson"]):
                self.issue("skill_without_lesson", f"Skill '{skill}' has no detected lesson link", "medium")

        age_per_file = defaultdict(int)
        for a in self.findings["age_rules"].values():
            if a.confidence >= 0.7:
                age_per_file[a.file] += 1
        for lesson in self.findings["lessons"].values():
            if lesson.confidence < 0.75 or lesson.source_of_truth in {"test_only", "mock_only"}:
                continue
            if age_per_file[lesson.file] == 0:
                self.issue("lesson_without_age_rule", f"Lesson '{lesson.name}' in {lesson.file}:{lesson.line} has no nearby age/grade rule", "low")

        lesson_to_gen = rel_pairs["lesson_to_generator"]
        for lesson in self.findings["lessons"].values():
            if lesson.confidence < 0.75 or lesson.source_of_truth in {"test_only", "mock_only"}:
                continue
            if not any(a == lesson.name.lower() for a, _ in lesson_to_gen):
                self.issue("lesson_without_generator", f"Lesson '{lesson.name}' has no generator link", "low")

        linked_nodes = {b for _, b in rel_pairs["lesson_to_progression_node"]}
        for node in sorted(set(progression_names)):
            if node not in linked_nodes:
                self.issue("progression_node_without_lesson", f"Progression node '{node}' has no lesson link", "medium")

        for (file, route_name, line), has_logic in self.route_logic.items():
            if not has_logic:
                self.issue("api_route_without_backend_logic", f"Route {route_name} at {file}:{line} may not call backend runtime logic", "high")

        for (file, comp, line), has_api in self.component_api_source.items():
            if not has_api:
                self.issue("frontend_without_api_source", f"Frontend component {comp} at {file}:{line} has no detected API source", "medium")

        if self.student_persistence:
            for (file, _, _), persists in self.student_persistence.items():
                if not persists:
                    self.issue("student_progress_without_persistence", f"Student progress references in {file} with no persistence signals", "high")
        else:
            self.issue("student_progress_without_persistence", "No student progress persistence signals detected", "high")

        subject_counter = Counter(subject_names)
        for name, count in subject_counter.items():
            if count > 12:
                self.issue("duplicate_subjects", f"Subject '{name}' appears {count} times; verify deduplication and canonical ownership", "low")

        gen_counter = Counter(generator_names)
        for name, count in gen_counter.items():
            if count > 6:
                self.issue("duplicate_lesson_generators", f"Lesson generator '{name}' appears {count} times", "low")

        runtime_linked_entities = set()
        for rel in self.relations.values():
            runtime_linked_entities.add((rel.from_type, rel.from_name.lower()))
            runtime_linked_entities.add((rel.to_type, rel.to_name.lower()))
        for etype in ["subjects", "skills", "lessons", "progression_nodes"]:
            for f in self.findings[etype].values():
                if f.source_of_truth == "canonical_config" and f.confidence >= 0.75 and (f.entity_type, f.name.lower()) not in runtime_linked_entities:
                    self.issue("orphan_curriculum_entities", f"Canonical entity '{f.name}' ({etype}) in {f.file}:{f.line} has no detected runtime relationship", "medium")

    def issue(self, code: str, message: str, severity: str = "medium") -> None:
        record = {"code": code, "severity": severity, "message": message}
        if record not in self.issues:
            self.issues.append(record)

    def maturity(self) -> Dict[str, Any]:
        def has_entity(kind: str, min_count: int, min_conf: float = 0.7) -> bool:
            return sum(1 for f in self.findings[kind].values() if f.confidence >= min_conf and f.source_of_truth not in {"test_only", "mock_only"}) >= min_count

        flags = {
            "subject_taxonomy": has_entity("subjects", 4),
            "skill_graph": has_entity("skills", 4) and len([r for r in self.relations.values() if r.relation_type == "subject_to_skill"]) > 0,
            "lesson_engine": has_entity("lesson_generators", 1, 0.75),
            "difficulty_scaling": any(f.name in {"difficulty", "level"} for f in self.findings["age_rules"].values()),
            "age_based_progression": has_entity("age_rules", 2) and has_entity("progression_nodes", 2),
            "mastery_system": any("mastery" in f.name for f in self.findings["student_links"].values()) or any("mastery" in f.snippet.lower() for f in self.findings["skills"].values()),
            "adaptive_learning": self.contains_runtime_tokens({"adaptive", "bandit", "recommend", "personalized", "axion"}),
            "student_telemetry": self.contains_runtime_tokens({"telemetry", "metrics", "analytics", "event", "tracking"}),
            "progress_persistence": any(self.student_persistence.values()),
        }
        score = sum(1 for v in flags.values() if v)
        total = len(flags)
        return {
            "dimensions": [{"name": k, "present": v} for k, v in flags.items()],
            "score": score,
            "max_score": total,
            "percentage": round((score / total) * 100.0, 1),
        }

    def contains_runtime_tokens(self, tokens: Set[str]) -> bool:
        for kind in ["lesson_generators", "student_links", "api_routes", "age_rules", "skills"]:
            for f in self.findings[kind].values():
                if f.source_of_truth not in {"runtime_logic", "canonical_config"}:
                    continue
                low = (f.snippet + " " + f.name).lower()
                if any(t in low for t in tokens):
                    return True
        return False

    def generate_graph(self) -> Dict[str, Any]:
        nodes = {}
        source_priority = {
            "canonical_config": 4,
            "runtime_logic": 3,
            "ui_reference": 2,
            "unknown": 1,
            "test_only": 0,
            "mock_only": 0,
        }
        for etype in ENTITY_ORDER:
            for f in self.findings[etype].values():
                if f.confidence < 0.65:
                    continue
                node_id = f"{etype}:{f.name.lower()}"
                if node_id not in nodes:
                    nodes[node_id] = {
                        "id": node_id,
                        "type": etype,
                        "name": f.name,
                        "confidence": round(f.confidence, 3),
                        "source_of_truth": f.source_of_truth,
                        "evidence": {"file": f.file, "line": f.line, "snippet": f.snippet},
                    }
                    continue
                existing = nodes[node_id]
                existing_pri = source_priority.get(existing["source_of_truth"], 0)
                current_pri = source_priority.get(f.source_of_truth, 0)
                if (current_pri, f.confidence) > (existing_pri, existing["confidence"]):
                    nodes[node_id] = {
                        "id": node_id,
                        "type": etype,
                        "name": f.name,
                        "confidence": round(f.confidence, 3),
                        "source_of_truth": f.source_of_truth,
                        "evidence": {"file": f.file, "line": f.line, "snippet": f.snippet},
                    }

        edges = [r.to_dict() for r in sorted(self.relations.values(), key=lambda x: (x.relation_type, x.file, x.from_name.lower(), x.to_name.lower()))]
        return {"nodes": list(nodes.values()), "edges": edges}

    def build_payload(self) -> Dict[str, Any]:
        return {
            "summary": {
                "files_scanned": self.files_scanned,
                "entity_counts": {key: len(self.findings[key]) for key in ENTITY_ORDER},
                "relation_counts": {rel: sum(1 for r in self.relations.values() if r.relation_type == rel) for rel in RELATION_TYPES},
                "issues_count": len(self.issues),
            },
            "entities": {
                key: [
                    f.to_dict()
                    for f in sorted(self.findings[key].values(), key=lambda x: (-x.confidence, x.file, x.line, x.name.lower()))
                ]
                for key in ENTITY_ORDER
            },
            "relationships": [
                r.to_dict()
                for r in sorted(self.relations.values(), key=lambda x: (-x.confidence, x.relation_type, x.file, x.from_name.lower(), x.to_name.lower()))
            ],
            "issues": self.issues,
            "maturity": self.maturity(),
        }

    def write_outputs(self, payload: Dict[str, Any], graph: Dict[str, Any]) -> None:
        OUTPUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        OUTPUT_GRAPH.write_text(json.dumps(graph, indent=2, ensure_ascii=False), encoding="utf-8")
        OUTPUT_TXT.write_text(self.human_report(payload, graph), encoding="utf-8")

    def human_report(self, payload: Dict[str, Any], graph: Dict[str, Any]) -> str:
        s = payload["summary"]
        lines: List[str] = []
        lines.append("Axiora Path - APRENDER Semantic Architecture Audit (v2)")
        lines.append("=" * 62)
        lines.append(f"Repository: {self.root}")
        lines.append(f"Files scanned: {s['files_scanned']}")
        lines.append("")
        lines.append("Entity counts:")
        for k in ENTITY_ORDER:
            lines.append(f"- {k}: {s['entity_counts'][k]}")
        lines.append("")
        lines.append("Relationship counts:")
        for rel, count in s["relation_counts"].items():
            lines.append(f"- {rel}: {count}")
        lines.append("")

        maturity = payload["maturity"]
        lines.append(f"Learning maturity: {maturity['score']}/{maturity['max_score']} ({maturity['percentage']}%)")
        for d in maturity["dimensions"]:
            lines.append(f"- {d['name']}: {'present' if d['present'] else 'missing'}")
        lines.append("")

        lines.append(f"Architectural issues ({len(payload['issues'])}):")
        if payload["issues"]:
            for issue in payload["issues"][:180]:
                lines.append(f"- [{issue['severity']}] {issue['code']}: {issue['message']}")
            if len(payload["issues"]) > 180:
                lines.append(f"- ... {len(payload['issues']) - 180} additional issues omitted")
        else:
            lines.append("- none")
        lines.append("")

        lines.append("Top high-confidence evidence (first 20 per entity):")
        for k in ENTITY_ORDER:
            lines.append(f"{k}:")
            items = [x for x in payload["entities"][k] if x["confidence"] >= 0.85][:20]
            if not items:
                lines.append("- none")
                continue
            for item in items:
                lines.append(f"- {item['name']} | {item['file']}:{item['line']} | conf={item['confidence']} | {item['source_of_truth']} | {item['snippet']}")
        lines.append("")

        lines.append(f"Graph nodes: {len(graph['nodes'])}")
        lines.append(f"Graph edges: {len(graph['edges'])}")
        return "\n".join(lines).rstrip() + "\n"

    def print_terminal_summary(self, payload: Dict[str, Any]) -> None:
        c = payload["summary"]["entity_counts"]
        print("Learning semantic architecture audit complete")
        print(f"Files scanned: {self.files_scanned}")
        print(f"Subjects detected: {c['subjects']}")
        print(f"Skills detected: {c['skills']}")
        print(f"Lessons detected: {c['lessons']}")
        print(f"Lesson generators detected: {c['lesson_generators']}")
        print(f"Progression nodes detected: {c['progression_nodes']}")
        print(f"API learning routes detected: {c['api_routes']}")
        print(f"Frontend learning components detected: {c['frontend_components']}")
        print(f"Architectural issues detected: {len(payload['issues'])}")
        print(f"JSON report: {OUTPUT_JSON}")
        print(f"Text report: {OUTPUT_TXT}")
        print(f"Graph report: {OUTPUT_GRAPH}")

    def run(self) -> Dict[str, Any]:
        for path in self.iter_files():
            self.files_scanned += 1
            self.scan_file(path)

        self.build_relationships()
        self.collect_issues()
        payload = self.build_payload()
        graph = self.generate_graph()
        self.write_outputs(payload, graph)
        self.print_terminal_summary(payload)
        return payload


def main() -> int:
    auditor = LearningArchitectureAuditor(ROOT)
    auditor.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
