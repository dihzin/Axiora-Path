from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


EXPECTED_SUBJECT_FILES = {
    "math.yaml",
    "portuguese.yaml",
    "english.yaml",
    "science.yaml",
    "logic.yaml",
    "finance.yaml",
    "geography.yaml",
    "history.yaml",
}
OUT_JSON = "learning_audit_v3.json"
OUT_REPORT = "learning_audit_v3_report.txt"


@dataclass(slots=True)
class AuditCheck:
    rule_id: str
    title: str
    status: str
    details: str
    evidence: list[str]
    metrics: dict[str, Any]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _parse_scalar(raw: str) -> str:
    value = raw.strip()
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1]
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1]
    return value


def _parse_curriculum_subject(path: Path) -> dict[str, Any]:
    lines = path.read_text(encoding="utf-8").splitlines()
    subject = ""
    age_groups: list[str] = []
    skills: dict[str, dict[str, list[str]]] = {}
    lesson_order: list[str] = []
    current_skill: str | None = None
    current_list: str | None = None
    in_age_groups = False
    in_lesson_order = False

    for raw_line in lines:
        if not raw_line.strip():
            continue
        line = raw_line.rstrip()
        stripped = line.strip()
        indent = len(line) - len(line.lstrip(" "))

        if indent == 0 and stripped.startswith("subject:"):
            subject = _parse_scalar(stripped.split(":", 1)[1])
            in_age_groups = False
            in_lesson_order = False
            current_skill = None
            current_list = None
            continue
        if indent == 0 and stripped == "age_groups:":
            in_age_groups = True
            in_lesson_order = False
            current_skill = None
            current_list = None
            continue
        if indent == 0 and stripped == "skills:":
            in_age_groups = False
            in_lesson_order = False
            current_skill = None
            current_list = None
            continue
        if indent == 0 and stripped == "lesson_order:":
            in_age_groups = False
            in_lesson_order = True
            current_skill = None
            current_list = None
            continue

        if in_age_groups and indent == 2 and stripped.startswith("- "):
            age_groups.append(_parse_scalar(stripped[2:]))
            continue

        if in_lesson_order and indent == 2 and stripped.startswith("- "):
            lesson_order.append(_parse_scalar(stripped[2:]))
            continue

        if indent == 2 and stripped.endswith(":"):
            current_skill = stripped[:-1].strip()
            skills[current_skill] = {
                "subskills": [],
                "lessons": [],
                "difficulty_progression": [],
            }
            current_list = None
            continue

        if current_skill is not None and indent == 4 and stripped.endswith(":"):
            current_list = stripped[:-1].strip()
            continue

        if current_skill is not None and current_list is not None and indent == 6 and stripped.startswith("- "):
            skills[current_skill][current_list].append(_parse_scalar(stripped[2:]))

    return {
        "subject": subject,
        "age_groups": age_groups,
        "skills": skills,
        "lesson_order": lesson_order,
    }


def _curriculum_subjects() -> tuple[Path, list[Path], list[dict[str, Any]]]:
    subjects_dir = repo_root() / "apps" / "api" / "app" / "curriculum" / "subjects"
    files = sorted(subjects_dir.glob("*.yaml"))
    parsed = [_parse_curriculum_subject(path) for path in files]
    return subjects_dir, files, parsed


def _collect_curriculum_lessons(parsed_subjects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    lessons: list[dict[str, Any]] = []
    for subject in parsed_subjects:
        for skill_name, skill_payload in subject["skills"].items():
            difficulties = skill_payload.get("difficulty_progression", [])
            for index, lesson_name in enumerate(skill_payload.get("lessons", [])):
                lessons.append(
                    {
                        "subject": subject["subject"],
                        "skill": skill_name,
                        "lesson": lesson_name,
                        "difficulty": difficulties[min(index, len(difficulties) - 1)] if difficulties else None,
                        "age_groups": list(subject.get("age_groups", [])),
                    }
                )
    return lessons


def _load_sources() -> dict[str, str]:
    root = repo_root()
    files = {
        "lesson_engine": root / "apps" / "api" / "app" / "services" / "lesson_engine.py",
        "learn_v2": root / "apps" / "api" / "app" / "api" / "routes" / "learn_v2.py",
        "models_learning": root / "apps" / "api" / "app" / "models_learning.py",
        "learning_repository": root / "apps" / "api" / "app" / "services" / "learning_repository.py",
        "client": root / "apps" / "web" / "lib" / "api" / "client.ts",
        "use_learning_state": root / "apps" / "web" / "hooks" / "useLearningState.ts",
        "trail_screen": root / "apps" / "web" / "components" / "trail" / "TrailScreen.tsx",
        "progression_map": root / "apps" / "web" / "components" / "trail" / "ProgressionMap.tsx",
    }
    return {name: _read_text(path) for name, path in files.items()}


def _check_canonical_curriculum() -> AuditCheck:
    subjects_dir, files, parsed = _curriculum_subjects()
    found_files = {path.name for path in files}
    missing_files = sorted(EXPECTED_SUBJECT_FILES - found_files)
    extra_files = sorted(found_files - EXPECTED_SUBJECT_FILES)
    has_all_subjects = subjects_dir.exists() and not missing_files and len(parsed) == len(EXPECTED_SUBJECT_FILES)
    evidence = [str(subjects_dir), *[path.name for path in files]]
    details = "Canonical curriculum directory and expected subject YAML files are present."
    if not has_all_subjects:
        details = "Canonical curriculum is incomplete or missing expected subject YAML files."
    if extra_files:
        evidence.append(f"extra_files={','.join(extra_files)}")
    if missing_files:
        evidence.append(f"missing_files={','.join(missing_files)}")
    return AuditCheck(
        rule_id="canonical_curriculum_exists",
        title="Canonical curriculum exists",
        status="PASS" if has_all_subjects else "FAIL",
        details=details,
        evidence=evidence,
        metrics={
            "expected_subject_files": len(EXPECTED_SUBJECT_FILES),
            "found_subject_files": len(found_files),
            "missing_subject_files": missing_files,
        },
    )


def _check_subjects_have_skills() -> AuditCheck:
    _, _, parsed = _curriculum_subjects()
    failing = [subject["subject"] or "<unknown>" for subject in parsed if not subject["skills"]]
    return AuditCheck(
        rule_id="subject_must_have_skills",
        title="Subject must have skills",
        status="PASS" if not failing else "FAIL",
        details="Every curriculum subject defines at least one skill." if not failing else "Some subjects do not define any skill.",
        evidence=failing or [subject["subject"] for subject in parsed],
        metrics={
            "subjects_total": len(parsed),
            "subjects_without_skills": failing,
        },
    )


def _check_skills_have_lessons() -> AuditCheck:
    _, _, parsed = _curriculum_subjects()
    failing: list[str] = []
    total_skills = 0
    for subject in parsed:
        for skill_name, skill_payload in subject["skills"].items():
            total_skills += 1
            if not skill_payload.get("lessons"):
                failing.append(f"{subject['subject']}::{skill_name}")
    return AuditCheck(
        rule_id="skill_must_have_lessons",
        title="Skill must have lessons",
        status="PASS" if not failing else "FAIL",
        details="Every curriculum skill defines at least one lesson." if not failing else "Some curriculum skills are missing lessons.",
        evidence=failing or [f"{subject['subject']}::{skill_name}" for subject in parsed for skill_name in subject["skills"].keys()],
        metrics={
            "skills_total": total_skills,
            "skills_without_lessons": failing,
        },
    )


def _check_lessons_have_generators(sources: dict[str, str]) -> AuditCheck:
    lessons = _collect_curriculum_lessons(_curriculum_subjects()[2])
    lesson_engine_source = sources["lesson_engine"]
    learn_v2_source = sources["learn_v2"]
    generator_connected = all(
        token in lesson_engine_source for token in ("class LessonEngine", "def create_lesson", "def generate_questions", "def generate_lesson_contents")
    ) and "LessonEngine" in learn_v2_source and "create_lesson" in learn_v2_source
    missing = [] if generator_connected else [lesson["lesson"] for lesson in lessons]
    return AuditCheck(
        rule_id="lesson_must_have_generator",
        title="Lesson must have generator",
        status="PASS" if generator_connected else "FAIL",
        details="Curriculum lessons route through the centralized LessonEngine generator." if generator_connected else "Curriculum lessons are not fully connected to the centralized LessonEngine.",
        evidence=[
            "apps/api/app/services/lesson_engine.py",
            "apps/api/app/api/routes/learn_v2.py",
            f"lessons_checked={len(lessons)}",
        ] + missing[:5],
        metrics={
            "lessons_total": len(lessons),
            "generator_connected": generator_connected,
        },
    )


def _check_lessons_have_age_rules(sources: dict[str, str]) -> AuditCheck:
    parsed = _curriculum_subjects()[2]
    lessons = _collect_curriculum_lessons(parsed)
    lesson_engine_source = sources["lesson_engine"]
    age_rule_connected = "_cap_for_age_group" in lesson_engine_source and "age_group" in lesson_engine_source
    missing = [lesson["lesson"] for lesson in lessons if not lesson["age_groups"]]
    passing = age_rule_connected and not missing
    return AuditCheck(
        rule_id="lesson_must_have_age_rule",
        title="Lesson must have age rule",
        status="PASS" if passing else "FAIL",
        details="Lessons inherit subject age groups and the LessonEngine caps difficulty by age group." if passing else "Some lessons are missing age groups or the LessonEngine does not enforce age-group-aware difficulty.",
        evidence=[
            "apps/api/app/curriculum/subjects/*.yaml",
            "apps/api/app/services/lesson_engine.py::_cap_for_age_group",
        ] + missing[:5],
        metrics={
            "lessons_total": len(lessons),
            "lessons_without_age_groups": len(missing),
            "engine_age_rule_connected": age_rule_connected,
        },
    )


def _check_progress_persistence(sources: dict[str, str]) -> AuditCheck:
    models_source = sources["models_learning"]
    repo_source = sources["learning_repository"]
    route_source = sources["learn_v2"]
    required_models = ("class StudentSkillMastery", "class StudentLessonProgress", "class StudentSubjectState")
    required_repo_functions = (
        "def get_student_skill_state",
        "def update_skill_mastery",
        "def register_lesson_completion",
        "def get_student_progress",
    )
    progress_connected = all(token in models_source for token in required_models) and all(
        token in repo_source for token in required_repo_functions
    ) and "update_skill_mastery(" in route_source and "register_lesson_completion(" in route_source
    return AuditCheck(
        rule_id="progress_must_be_persisted",
        title="Progress must be persisted",
        status="PASS" if progress_connected else "FAIL",
        details="Student mastery, lesson progress, and subject state are persisted and updated by the Learn API." if progress_connected else "Student progress persistence is incomplete or not wired into the Learn API.",
        evidence=[
            "apps/api/app/models_learning.py",
            "apps/api/app/services/learning_repository.py",
            "apps/api/app/api/routes/learn_v2.py",
        ],
        metrics={
            "models_present": progress_connected,
        },
    )


def _check_api_routes_connected_to_lesson_engine(sources: dict[str, str]) -> AuditCheck:
    route_source = sources["learn_v2"]
    required_tokens = (
        'prefix="/learn"',
        '"/subjects"',
        '"/skills"',
        '"/lesson/start"',
        '"/lesson/complete"',
        '"/next"',
        "LessonEngine",
        "create_lesson(",
        "CurriculumLoader",
        "SkillGraph",
        "AxionLearningEngine",
    )
    connected = all(token in route_source for token in required_tokens)
    return AuditCheck(
        rule_id="api_routes_connected_to_lesson_engine",
        title="API routes connected to lesson engine",
        status="PASS" if connected else "FAIL",
        details="Learn V2 routes are wired to the curriculum, skill graph, lesson engine, and Axion learning engine." if connected else "Learn V2 routes are missing one or more required engine integrations.",
        evidence=["apps/api/app/api/routes/learn_v2.py"],
        metrics={
            "required_tokens_checked": len(required_tokens),
            "connected": connected,
        },
    )


def _check_frontend_nodes_connected_to_api(sources: dict[str, str]) -> AuditCheck:
    client_source = sources["client"]
    hook_source = sources["use_learning_state"]
    trail_source = sources["trail_screen"]
    map_source = sources["progression_map"]
    connected = all(
        token in client_source
        for token in ("getLearnSkills", "skillGraph", "prerequisiteMasteryThreshold", "lessonId")
    ) and all(
        token in hook_source
        for token in ("useLearningState", "getLearnSkills", "setSkillGraph(response.skillGraph)", "lessonSkillMap[lesson.lessonId]")
    ) and all(
        token in trail_source
        for token in ("ProgressionMap", "useLearningState", "lessonId: lesson.id", "difficulty: lesson.difficulty", "stars: lesson.starsEarned")
    ) and all(
        token in map_source
        for token in ("lessonId: number", "difficulty: string", "stars: number", 'NodeStatus = "done" | "current" | "available" | "locked"')
    )
    return AuditCheck(
        rule_id="frontend_nodes_connected_to_api",
        title="Frontend nodes connected to API",
        status="PASS" if connected else "FAIL",
        details="Progression map nodes are built from Learn API data through useLearningState." if connected else "Frontend progression nodes are not fully wired to Learn API data.",
        evidence=[
            "apps/web/lib/api/client.ts",
            "apps/web/hooks/useLearningState.ts",
            "apps/web/components/trail/TrailScreen.tsx",
            "apps/web/components/trail/ProgressionMap.tsx",
        ],
        metrics={
            "connected": connected,
        },
    )


def run_audit() -> dict[str, Any]:
    sources = _load_sources()
    checks = [
        _check_canonical_curriculum(),
        _check_subjects_have_skills(),
        _check_skills_have_lessons(),
        _check_lessons_have_generators(sources),
        _check_lessons_have_age_rules(sources),
        _check_progress_persistence(sources),
        _check_api_routes_connected_to_lesson_engine(sources),
        _check_frontend_nodes_connected_to_api(sources),
    ]
    failed = [check for check in checks if check.status != "PASS"]
    result = {
        "generated_at": datetime.now(UTC).isoformat(),
        "status": "PASS" if not failed else "FAIL",
        "summary": {
            "total_checks": len(checks),
            "passed": len(checks) - len(failed),
            "failed": len(failed),
        },
        "checks": [asdict(check) for check in checks],
    }
    return result


def _render_report(result: dict[str, Any]) -> str:
    lines = [
        "Axiora Learning Audit V3",
        f"Generated at: {result['generated_at']}",
        f"Overall status: {result['status']}",
        "",
        "Summary",
        f"- Total checks: {result['summary']['total_checks']}",
        f"- Passed: {result['summary']['passed']}",
        f"- Failed: {result['summary']['failed']}",
        "",
        "Checks",
    ]
    for check in result["checks"]:
        lines.append(f"- [{check['status']}] {check['rule_id']}: {check['title']}")
        lines.append(f"  Details: {check['details']}")
        if check["evidence"]:
            lines.append(f"  Evidence: {', '.join(check['evidence'])}")
        if check["metrics"]:
            metrics_text = ", ".join(f"{key}={value}" for key, value in check["metrics"].items())
            lines.append(f"  Metrics: {metrics_text}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    root = repo_root()
    result = run_audit()
    json_path = root / OUT_JSON
    report_path = root / OUT_REPORT
    json_path.write_text(json.dumps(result, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    report_path.write_text(_render_report(result), encoding="utf-8")
    print(f"Wrote {json_path}")
    print(f"Wrote {report_path}")
    print(f"Audit status: {result['status']}")
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
