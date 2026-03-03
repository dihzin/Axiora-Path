from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import GeneratedVariant, Question, QuestionTemplate, QuestionTemplateType, QuestionType, QuestionVariant, Skill, Subject
from app.services.adaptive_learning import _ensure_selectable_metadata, _extract_word_from_syllable_prompt, _syllable_count_pt

OBJECTIVE_TYPES = {QuestionType.MCQ, QuestionType.TRUE_FALSE, QuestionType.FILL_BLANK}
OBJECTIVE_TEMPLATE_TYPES = {
    QuestionTemplateType.MATH_ARITH,
    QuestionTemplateType.MATH_WORDPROB,
    QuestionTemplateType.PT_PUNCTUATION,
    QuestionTemplateType.PT_SYLLABLES,
    QuestionTemplateType.EN_VOCAB,
}


@dataclass
class AuditIssue:
    source: str
    record_id: str
    subject: str
    message: str


def _as_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    out: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            out.append(item)
    return out


def _validate_objective_metadata(metadata: dict[str, Any]) -> str | None:
    options = _as_list(metadata.get("options")) or _as_list(metadata.get("choices"))
    if len(options) == 0:
        return "missing_options"
    correct_id = str(metadata.get("correctOptionId") or "").strip()
    if not correct_id:
        return "missing_correct_option_id"
    valid_ids = {str(item.get("id") or "").strip() for item in options}
    if correct_id not in valid_ids:
        return "correct_option_id_not_in_options"
    return None


def _validate_syllable_semantics(*, prompt: str, metadata: dict[str, Any]) -> str | None:
    word = _extract_word_from_syllable_prompt(prompt)
    if not word:
        return None
    expected = _syllable_count_pt(word)
    if expected is None:
        return None
    options = _as_list(metadata.get("options")) or _as_list(metadata.get("choices"))
    if len(options) == 0:
        return "syllable_prompt_without_options"
    correct_id = str(metadata.get("correctOptionId") or "").strip()
    if not correct_id:
        return "syllable_prompt_without_correct_option_id"
    correct_item = next((item for item in options if str(item.get("id") or "").strip() == correct_id), None)
    if not isinstance(correct_item, dict):
        return "syllable_correct_option_missing"
    try:
        correct_label_value = int(float(str(correct_item.get("label") or "").strip()))
    except Exception:
        return "syllable_correct_label_not_numeric"
    if int(correct_label_value) != int(expected):
        return "syllable_correct_label_mismatch"
    return None


def _audit_questions(db: Session, *, apply_fix: bool) -> tuple[int, list[AuditIssue]]:
    issues: list[AuditIssue] = []
    updates = 0
    rows = db.execute(
        select(Question, Subject.name)
        .join(Skill, Skill.id == Question.skill_id)
        .join(Subject, Subject.id == Skill.subject_id)
    ).all()
    for question, subject_name in rows:
        if question.type not in OBJECTIVE_TYPES:
            continue
        original = dict(question.metadata_json or {})
        fixed = _ensure_selectable_metadata(
            item_type=question.type,
            prompt=str(question.prompt or ""),
            metadata=original,
        )
        issue = _validate_objective_metadata(original) or _validate_syllable_semantics(prompt=str(question.prompt or ""), metadata=original)
        if issue:
            issues.append(
                AuditIssue(
                    source="questions",
                    record_id=str(question.id),
                    subject=str(subject_name),
                    message=issue,
                )
            )
        if apply_fix and fixed != original:
            question.metadata_json = fixed
            updates += 1
    return updates, issues


def _audit_question_variants(db: Session, *, apply_fix: bool) -> tuple[int, list[AuditIssue]]:
    issues: list[AuditIssue] = []
    updates = 0
    rows = db.execute(
        select(QuestionVariant, Question, Subject.name)
        .join(Question, Question.id == QuestionVariant.question_id)
        .join(Skill, Skill.id == Question.skill_id)
        .join(Subject, Subject.id == Skill.subject_id)
    ).all()
    for variant, question, subject_name in rows:
        if question.type not in OBJECTIVE_TYPES:
            continue
        payload = dict(variant.variant_data or {})
        original_meta = dict(payload.get("metadata", {}))
        fixed_meta = _ensure_selectable_metadata(
            item_type=question.type,
            prompt=str(payload.get("prompt", question.prompt or "")),
            metadata=original_meta,
        )
        prompt = str(payload.get("prompt", question.prompt or ""))
        issue = _validate_objective_metadata(original_meta) or _validate_syllable_semantics(prompt=prompt, metadata=original_meta)
        if issue:
            issues.append(
                AuditIssue(
                    source="question_variants",
                    record_id=str(variant.id),
                    subject=str(subject_name),
                    message=issue,
                )
            )
        if apply_fix and fixed_meta != original_meta:
            payload["metadata"] = fixed_meta
            variant.variant_data = payload
            updates += 1
    return updates, issues


def _audit_generated_variants(db: Session, *, apply_fix: bool) -> tuple[int, list[AuditIssue]]:
    issues: list[AuditIssue] = []
    updates = 0
    rows = db.execute(
        select(GeneratedVariant, QuestionTemplate, Subject.name)
        .join(QuestionTemplate, QuestionTemplate.id == GeneratedVariant.template_id)
        .join(Skill, Skill.id == QuestionTemplate.skill_id)
        .join(Subject, Subject.id == Skill.subject_id)
    ).all()
    for variant, template, subject_name in rows:
        if template.template_type not in OBJECTIVE_TEMPLATE_TYPES:
            continue
        payload = dict(variant.variant_data or {})
        prompt = str(payload.get("prompt", ""))
        metadata = dict(payload.get("metadata", {}))
        fixed_meta = _ensure_selectable_metadata(
            item_type=QuestionType.MCQ,
            prompt=prompt,
            metadata=metadata,
        )
        issue = _validate_objective_metadata(metadata) or _validate_syllable_semantics(prompt=prompt, metadata=metadata)
        if issue:
            issues.append(
                AuditIssue(
                    source="generated_variants",
                    record_id=str(variant.id),
                    subject=str(subject_name),
                    message=issue,
                )
            )
        if apply_fix and fixed_meta != metadata:
            payload["metadata"] = fixed_meta
            variant.variant_data = payload
            updates += 1
    return updates, issues


def run_audit(*, apply_fix: bool) -> int:
    with SessionLocal() as db:
        total_updates = 0
        issues: list[AuditIssue] = []

        updated, found = _audit_questions(db, apply_fix=apply_fix)
        total_updates += updated
        issues.extend(found)

        updated, found = _audit_question_variants(db, apply_fix=apply_fix)
        total_updates += updated
        issues.extend(found)

        updated, found = _audit_generated_variants(db, apply_fix=apply_fix)
        total_updates += updated
        issues.extend(found)

        if apply_fix and total_updates > 0:
            db.commit()
        else:
            db.rollback()

    by_subject: dict[str, int] = defaultdict(int)
    by_source: dict[str, int] = defaultdict(int)
    by_issue: dict[str, int] = defaultdict(int)
    for item in issues:
        by_subject[item.subject] += 1
        by_source[item.source] += 1
        by_issue[item.message] += 1

    report = {
        "issues_total": len(issues),
        "updated_records": int(total_updates) if apply_fix else 0,
        "by_subject": dict(sorted(by_subject.items(), key=lambda x: x[0])),
        "by_source": dict(sorted(by_source.items(), key=lambda x: x[0])),
        "by_issue": dict(sorted(by_issue.items(), key=lambda x: x[0])),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if len(issues) > 0 and not apply_fix else 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Audita consistência pedagógica do banco de questões.")
    parser.add_argument("--fix", action="store_true", help="Aplica correções seguras de metadata para questões objetivas.")
    args = parser.parse_args()
    raise SystemExit(run_audit(apply_fix=bool(args.fix)))


if __name__ == "__main__":
    main()
