from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import (
    GeneratedVariant,
    Lesson,
    Question,
    QuestionDifficulty,
    QuestionTemplate,
    QuestionTemplateType,
    QuestionType,
    QuestionVariant,
    Skill,
    Unit,
    UserSkillMastery,
)
from app.services import adaptive_learning as adaptive


@dataclass(slots=True)
class StudentSkillState:
    mastery: float
    age_group: str
    difficulty: str | None = None


@dataclass(slots=True)
class GeneratedLesson:
    skill_id: str
    subject_id: int | None
    lesson_id: int | None
    difficulty: QuestionDifficulty
    contents: adaptive.NextQuestionsPlan


class LessonEngine:
    def __init__(self, db: Session, *, tenant_id: int | None = None) -> None:
        self.db = db
        self.tenant_id = tenant_id

    def create_lesson(self, student_id: int, skill: str) -> GeneratedLesson:
        skill_row = self._get_skill(skill)
        state = self._load_student_skill_state(student_id=student_id, skill_id=str(skill_row.id))
        difficulty = self.determine_difficulty(state)
        contents = self.generate_lesson_contents(
            student_id=student_id,
            subject_id=int(skill_row.subject_id),
            lesson_id=None,
            focus_skill_id=str(skill_row.id),
            force_difficulty=difficulty,
            count=10,
        )
        return GeneratedLesson(
            skill_id=str(skill_row.id),
            subject_id=int(skill_row.subject_id),
            lesson_id=None,
            difficulty=difficulty,
            contents=contents,
        )

    def generate_questions(
        self,
        skill: str,
        difficulty: QuestionDifficulty,
        *,
        student_id: int,
        lesson_id: int | None = None,
        count: int = 10,
    ) -> adaptive.NextQuestionsPlan:
        skill_row = self._get_skill(skill)
        return self.generate_lesson_contents(
            student_id=student_id,
            subject_id=int(skill_row.subject_id),
            lesson_id=lesson_id,
            focus_skill_id=str(skill_row.id),
            force_difficulty=difficulty,
            count=count,
        )

    def determine_difficulty(
        self,
        student_skill_state: StudentSkillState | dict[str, Any],
    ) -> QuestionDifficulty:
        state = _coerce_student_skill_state(student_skill_state)
        if state.mastery < 0.35:
            difficulty = QuestionDifficulty.EASY
        elif state.mastery <= 0.70:
            difficulty = QuestionDifficulty.MEDIUM
        else:
            difficulty = QuestionDifficulty.HARD
        return _cap_for_age_group(difficulty, age_group=state.age_group)

    def generate_lesson_contents(
        self,
        *,
        student_id: int,
        subject_id: int | None,
        lesson_id: int | None,
        focus_skill_id: str | None,
        force_difficulty: QuestionDifficulty | None,
        count: int,
    ) -> adaptive.NextQuestionsPlan:
        now = datetime.now(UTC)
        safe_count = max(1, min(30, int(count)))
        settings = adaptive.resolve_effective_learning_settings(self.db, tenant_id=self.tenant_id)
        if not adaptive._subject_enabled(settings, subject_id):
            return adaptive.NextQuestionsPlan(
                items=[],
                focus_skills=[],
                difficulty_mix=adaptive.DifficultyMix(1.0, 0.0, 0.0),
                diagnostics={
                    "candidates_raw": 0,
                    "candidates_filtered": 0,
                    "fallback_reason": "subject_disabled",
                    "block_reason": "subject_disabled",
                },
            )

        boost_cap, ratio_boosts, trigger_review = adaptive.get_difficulty_cap_boost(
            self.db,
            user_id=student_id,
        )
        effective_ceiling = adaptive._effective_ceiling(settings.difficulty_ceiling, boost_cap)
        skill_ids = adaptive._resolve_focus_skill_ids(
            self.db,
            subject_id=subject_id,
            lesson_id=lesson_id,
            focus_skill_id=focus_skill_id,
        )
        focus_skills = adaptive._pick_focus_skills(
            self.db,
            user_id=student_id,
            skill_ids=skill_ids,
            now=now,
            force_due_reviews=trigger_review,
        )
        playable_focus_skills = [
            skill
            for skill in focus_skills
            if adaptive._skill_has_candidate_content(
                self.db,
                skill_id=skill.skill_id,
                lesson_id=lesson_id,
                subject_id=subject_id,
            )
        ]
        if playable_focus_skills:
            focus_skills = playable_focus_skills
        else:
            playable_skill_ids = [
                skill_id
                for skill_id in skill_ids
                if adaptive._skill_has_candidate_content(
                    self.db,
                    skill_id=skill_id,
                    lesson_id=lesson_id,
                    subject_id=subject_id,
                )
            ]
            if playable_skill_ids:
                focus_skills = adaptive._pick_focus_skills(
                    self.db,
                    user_id=student_id,
                    skill_ids=playable_skill_ids,
                    now=now,
                    force_due_reviews=trigger_review,
                )
        if not focus_skills:
            return adaptive.NextQuestionsPlan(
                items=[],
                focus_skills=[],
                difficulty_mix=adaptive.DifficultyMix(1.0, 0.0, 0.0),
                diagnostics={
                    "candidates_raw": 0,
                    "candidates_filtered": 0,
                    "fallback_reason": "no_focus_skills",
                    "block_reason": "no_focus_skills",
                },
            )

        avg_mastery = sum(item.mastery for item in focus_skills) / len(focus_skills)
        mix = adaptive._apply_difficulty_ratio_boosts(
            mix=adaptive._difficulty_mix_for_mastery(avg_mastery),
            easy_boost=float(ratio_boosts.get("easyRatioBoost", 0.0)),
            hard_boost=float(ratio_boosts.get("hardRatioBoost", 0.0)),
        )
        since = now - timedelta(days=adaptive.ANTI_REPEAT_DAYS)
        recent_qids, recent_vids = adaptive._recent_question_and_variant_ids(
            self.db,
            user_id=student_id,
            since=since,
        )
        day_bucket = now.strftime("%Y-%m-%d")
        request_seed = now.isoformat(timespec="microseconds")
        rng = adaptive.SeededRng(f"{student_id}:{subject_id}:{lesson_id}:{day_bucket}:{request_seed}:{safe_count}")
        items: list[adaptive.NextQuestionItem] = []
        candidates_raw = 0
        candidates_filtered = 0
        fallback_reason: str | None = None

        for idx in range(safe_count):
            skill_plan = focus_skills[idx % len(focus_skills)]
            target_difficulty = self._select_target_difficulty(
                rng=rng,
                mix=mix,
                effective_ceiling=effective_ceiling,
                force_difficulty=force_difficulty,
            )
            # Cap difficulty to what is appropriate for this skill's age group.
            # e.g. AGE_6_8 → EASY only; AGE_9_12 → at most MEDIUM.
            if skill_plan.age_group:
                target_difficulty = _cap_for_age_group(target_difficulty, age_group=skill_plan.age_group)
            batch = self._collect_candidates(
                student_id=student_id,
                tenant_id=self.tenant_id,
                skill_id=skill_plan.skill_id,
                lesson_id=lesson_id,
                subject_id=subject_id,
                target_difficulty=target_difficulty,
                skill_age_group=skill_plan.age_group,
                since=since,
                day_bucket=day_bucket,
                request_seed=request_seed,
                recent_qids=recent_qids,
                recent_vids=recent_vids,
                attempt_offset=idx * 10,
            )
            candidates_raw += int(batch["raw"])
            candidates_filtered += len(batch["items"])
            if not batch["items"]:
                fallback_reason = str(batch["fallback_reason"] or fallback_reason or "no_candidates_for_skill")
                continue

            ranked = sorted(batch["items"], key=lambda item: self._candidate_score(existing=items, item=item))
            picked = next(
                (
                    item
                    for item in ranked
                    if not self._prompt_key(item.prompt) in {self._prompt_key(existing.prompt) for existing in items}
                    and not adaptive._creates_type_streak(items, item.type)
                ),
                None,
            )
            if picked is None:
                picked = next(
                    (
                        item
                        for item in ranked
                        if not self._prompt_key(item.prompt) in {self._prompt_key(existing.prompt) for existing in items}
                    ),
                    None,
                )
            if picked is None:
                picked = next(
                    (item for item in ranked if not adaptive._creates_type_streak(items, item.type)),
                    None,
                )
            if picked is None:
                continue
            if self._prompt_key(picked.prompt) in {self._prompt_key(existing.prompt) for existing in items}:
                continue
            items.append(picked)
            if picked.question_id:
                recent_qids.add(str(picked.question_id))
            if picked.variant_id:
                recent_vids.add(str(picked.variant_id))

        adaptive.logger.info(
            "learning_next_candidates_diagnostics",
            extra={
                "student_id": student_id,
                "tenant_id": self.tenant_id,
                "subject_id": subject_id,
                "lesson_id": lesson_id,
                "candidates_raw": candidates_raw,
                "candidates_filtered": candidates_filtered,
                "fallback_reason": fallback_reason,
                "block_reason": None if items else (fallback_reason or "empty_batch"),
            },
        )
        return adaptive.NextQuestionsPlan(
            items=items,
            focus_skills=focus_skills,
            difficulty_mix=mix,
            diagnostics={
                "candidates_raw": candidates_raw,
                "candidates_filtered": candidates_filtered,
                "fallback_reason": fallback_reason,
                "block_reason": None if items else (fallback_reason or "empty_batch"),
            },
        )

    def _get_skill(self, skill: str) -> Skill:
        skill_row = self.db.get(Skill, str(skill))
        if skill_row is None:
            raise ValueError(f"Skill not found: {skill}")
        return skill_row

    def _load_student_skill_state(self, *, student_id: int, skill_id: str) -> StudentSkillState:
        skill_row = self._get_skill(skill_id)
        mastery_row = self.db.scalar(
            select(UserSkillMastery).where(
                UserSkillMastery.user_id == int(student_id),
                UserSkillMastery.skill_id == str(skill_id),
            )
        )
        return StudentSkillState(
            mastery=float(mastery_row.mastery) if mastery_row is not None else 0.0,
            age_group=str(skill_row.age_group.value if hasattr(skill_row.age_group, "value") else skill_row.age_group),
            difficulty=None,
        )

    def _select_target_difficulty(
        self,
        *,
        rng: adaptive.SeededRng,
        mix: adaptive.DifficultyMix,
        effective_ceiling: QuestionDifficulty,
        force_difficulty: QuestionDifficulty | None,
    ) -> QuestionDifficulty:
        if force_difficulty is not None:
            return adaptive._cap_difficulty(force_difficulty, effective_ceiling)
        return adaptive._cap_difficulty(
            rng.weighted_choice(
                [QuestionDifficulty.EASY, QuestionDifficulty.MEDIUM, QuestionDifficulty.HARD],
                [mix.easy, mix.medium, mix.hard],
            )
            or QuestionDifficulty.MEDIUM,
            effective_ceiling,
        )

    def _collect_candidates(
        self,
        *,
        student_id: int,
        tenant_id: int | None,
        skill_id: str,
        lesson_id: int | None,
        subject_id: int | None,
        target_difficulty: QuestionDifficulty,
        skill_age_group: str | None,
        since: datetime,
        day_bucket: str,
        request_seed: str,
        recent_qids: set[str],
        recent_vids: set[str],
        attempt_offset: int,
    ) -> dict[str, Any]:
        template_candidates: list[adaptive.NextQuestionItem] = []
        question_candidates: list[adaptive.NextQuestionItem] = []
        fallback_reason: str | None = None

        templates_query = (
            select(QuestionTemplate)
            .where(
                QuestionTemplate.skill_id == skill_id,
                QuestionTemplate.difficulty == target_difficulty,
            )
            .order_by(QuestionTemplate.created_at.asc())
        )
        if lesson_id is not None:
            templates_query = templates_query.where(
                or_(QuestionTemplate.lesson_id == lesson_id, QuestionTemplate.lesson_id.is_(None))
            )
        else:
            templates_query = templates_query.where(QuestionTemplate.lesson_id.is_(None))
        templates = self.db.scalars(templates_query).all()
        templates = sorted(
            templates,
            key=lambda item: sha256(f"{request_seed}:template:{item.id}".encode("utf-8")).hexdigest(),
        )

        for template in templates:
            try:
                used_signatures = adaptive._recent_template_signatures(
                    self.db,
                    user_id=student_id,
                    template_id=str(template.id),
                    since=since,
                )
                selected_variant: GeneratedVariant | None = None
                for attempt in range(6):
                    candidate = generate_variant(
                        self.db,
                        template=template,
                        user_id=student_id,
                        day_bucket=day_bucket,
                        request_seed=request_seed,
                        attempt_index=attempt_offset + attempt,
                    )
                    signature = str((candidate.variant_data or {}).get("signature", ""))
                    if signature and signature not in used_signatures:
                        selected_variant = candidate
                        break
                    self.db.delete(candidate)
                    self.db.flush()
                if selected_variant is None:
                    llm_generated = adaptive._generate_llm_variants_for_template(
                        self.db,
                        tenant_id=tenant_id,
                        user_id=student_id,
                        template=template,
                        used_signatures=used_signatures,
                        day_bucket=day_bucket,
                        count=5,
                    )
                    if llm_generated:
                        selected_variant = llm_generated[0]
                if selected_variant is not None:
                    template_candidates.append(
                        adaptive._build_template_item(template=template, generated_variant=selected_variant)
                    )
            except Exception:
                self.db.rollback()
                adaptive.logger.exception(
                    "adaptive_template_candidate_failed",
                    extra={
                        "user_id": student_id,
                        "tenant_id": tenant_id,
                        "template_id": str(template.id),
                        "lesson_id": lesson_id,
                        "subject_id": subject_id,
                    },
                )
                fallback_reason = fallback_reason or "template_generation_failed"

        q_query = (
            select(Question)
            .where(
                Question.skill_id == skill_id,
                Question.type != QuestionType.TEMPLATE,
                Question.difficulty == target_difficulty,
                # Exclude placeholder seed questions inserted by migration 0092.
                # These have the form "[Subject] Pergunta essencial (DIFFICULTY)."
                # and must never be served to students.
                ~Question.prompt.contains("Pergunta essencial"),
            )
            .order_by(Question.created_at.asc())
        )
        if lesson_id is not None:
            q_query = q_query.where(or_(Question.lesson_id == lesson_id, Question.lesson_id.is_(None)))
        elif subject_id is not None:
            q_query = q_query.where(
                or_(
                    Question.lesson_id.is_(None),
                    Question.lesson_id.in_(
                        select(Lesson.id).join(Unit, Unit.id == Lesson.unit_id).where(Unit.subject_id == subject_id)
                    ),
                )
            )
        questions = self.db.scalars(q_query).all()
        if questions:
            sorted_questions = sorted(
                questions,
                key=lambda item: (
                    1 if str(item.id) in recent_qids else 0,
                    sha256(f"{request_seed}:question:{item.id}".encode("utf-8")).hexdigest(),
                ),
            )
            for question in sorted_questions[:4]:
                try:
                    variants = self.db.scalars(
                        select(QuestionVariant).where(QuestionVariant.question_id == question.id)
                    ).all()
                    sorted_variants = sorted(
                        variants,
                        key=lambda item: (
                            1 if str(item.id) in recent_vids else 0,
                            sha256(f"{request_seed}:variant:{item.id}".encode("utf-8")).hexdigest(),
                        ),
                    )
                    compatible_variants = [
                        item
                        for item in sorted_variants
                        if adaptive._effective_question_difficulty(
                            base_difficulty=question.difficulty,
                            variant=item,
                            age_group=skill_age_group,
                        )
                        == target_difficulty
                    ]
                    preferred_variant = compatible_variants[0] if compatible_variants else None
                    question_candidates.append(
                        adaptive._build_question_item(
                            question=question,
                            variant=preferred_variant,
                            skill_age_group=skill_age_group,
                        )
                    )
                except Exception:
                    adaptive.logger.exception(
                        "adaptive_question_candidate_failed",
                        extra={
                            "user_id": student_id,
                            "tenant_id": tenant_id,
                            "question_id": str(question.id),
                            "lesson_id": lesson_id,
                            "subject_id": subject_id,
                        },
                    )
                    fallback_reason = fallback_reason or "question_candidate_failed"
        elif fallback_reason is None:
            fallback_reason = "no_question_bank_candidates"

        return {
            "items": [*question_candidates, *template_candidates],
            "raw": len(questions) + len(templates),
            "fallback_reason": fallback_reason,
        }

    @staticmethod
    def _prompt_key(prompt: str) -> str:
        return str(prompt or "").strip().lower()

    @staticmethod
    def _candidate_score(
        *,
        existing: list[adaptive.NextQuestionItem],
        item: adaptive.NextQuestionItem,
    ) -> tuple[int, int, int, int]:
        prompt_penalty = 1 if any(LessonEngine._prompt_key(existing_item.prompt) == LessonEngine._prompt_key(item.prompt) for existing_item in existing) else 0
        variant_penalty = 1 if item.variant_id and any(existing_item.variant_id == item.variant_id for existing_item in existing) else 0
        streak_penalty = 1 if adaptive._creates_type_streak(existing, item.type) else 0
        template_penalty = 1 if item.template_id is not None else 0
        return (prompt_penalty, variant_penalty, streak_penalty, template_penalty)


def create_lesson(db: Session, *, student_id: int, skill: str, tenant_id: int | None = None) -> GeneratedLesson:
    return LessonEngine(db, tenant_id=tenant_id).create_lesson(student_id, skill)


def generate_questions(
    db: Session,
    *,
    student_id: int,
    skill: str,
    difficulty: QuestionDifficulty,
    lesson_id: int | None = None,
    tenant_id: int | None = None,
    count: int = 10,
) -> adaptive.NextQuestionsPlan:
    return LessonEngine(db, tenant_id=tenant_id).generate_questions(
        skill,
        difficulty,
        student_id=student_id,
        lesson_id=lesson_id,
        count=count,
    )


def determine_difficulty(student_skill_state: StudentSkillState | dict[str, Any]) -> QuestionDifficulty:
    return LessonEngine.__new__(LessonEngine).determine_difficulty(student_skill_state)


def generate_lesson_contents(
    db: Session,
    *,
    student_id: int,
    subject_id: int | None,
    lesson_id: int | None,
    focus_skill_id: str | None,
    force_difficulty: QuestionDifficulty | None,
    tenant_id: int | None = None,
    count: int = 10,
) -> adaptive.NextQuestionsPlan:
    return LessonEngine(db, tenant_id=tenant_id).generate_lesson_contents(
        student_id=student_id,
        subject_id=subject_id,
        lesson_id=lesson_id,
        focus_skill_id=focus_skill_id,
        force_difficulty=force_difficulty,
        count=count,
    )


def generate_variant(
    db: Session,
    *,
    template: QuestionTemplate,
    user_id: int,
    day_bucket: str,
    request_seed: str,
    attempt_index: int,
) -> GeneratedVariant:
    seed = sha256(f"{user_id}:{template.id}:{day_bucket}:{request_seed}:{attempt_index}".encode("utf-8")).hexdigest()[:32]
    rng = adaptive.SeededRng(seed)
    variables = adaptive._generate_variables(spec=template.generator_spec or {}, rng=rng)
    if isinstance(variables.get("context"), str):
        context = str(variables["context"])
        singular, plural = adaptive._noun_forms_pt(context)
        variables["contextSingular"] = singular
        variables["contextPlural"] = plural
        if "a" in variables:
            variables["contextA"] = adaptive._label_with_count_pt(int(variables["a"]), context)
        if "b" in variables:
            variables["contextB"] = adaptive._label_with_count_pt(int(variables["b"]), context)
        if "answer" in variables:
            variables["contextAnswer"] = adaptive._label_with_count_pt(int(variables["answer"]), context)

    prompt = adaptive._render_template_str(template.prompt_template, variables) or ""
    explanation = adaptive._render_template_str(template.explanation_template, variables)

    if template.template_type == QuestionTemplateType.MATH_WORDPROB:
        name = str(variables.get("name", "A crianÃ§a"))
        a = int(variables.get("a", 0))
        b = int(variables.get("b", 0))
        answer = int(variables.get("answer", a + b))
        context = str(variables.get("context", "itens"))
        context_a = adaptive._label_with_count_pt(a, context)
        context_b = adaptive._label_with_count_pt(b, context)
        context_answer = adaptive._label_with_count_pt(answer, context)
        prompt = f"{name} tinha {a} {context_a} e ganhou {b} {context_b}. Quantos {context_answer} tem agora?"
        explanation = f"{name} somou {a} com {b} e chegou a {answer} {context_answer}."

    metadata = adaptive._render_metadata(renderer_spec=template.renderer_spec or {}, variables=variables, rng=rng)
    payload = {
        "variables": variables,
        "signature": adaptive._variant_signature(variables),
        "prompt": prompt,
        "explanation": explanation,
        "metadata": metadata,
    }
    row = GeneratedVariant(
        user_id=user_id,
        template_id=template.id,
        seed=seed,
        variant_data=payload,
    )
    db.add(row)
    db.flush()
    return row


def _coerce_student_skill_state(
    student_skill_state: StudentSkillState | dict[str, Any],
) -> StudentSkillState:
    if isinstance(student_skill_state, StudentSkillState):
        return student_skill_state
    if not isinstance(student_skill_state, dict):
        raise ValueError("student_skill_state must be a StudentSkillState or mapping")
    return StudentSkillState(
        mastery=float(student_skill_state.get("mastery", 0.0) or 0.0),
        age_group=str(student_skill_state.get("age_group") or student_skill_state.get("ageGroup") or "").strip(),
        difficulty=(
            None
            if student_skill_state.get("difficulty") is None
            else str(student_skill_state.get("difficulty")).strip()
        ),
    )


def _cap_for_age_group(difficulty: QuestionDifficulty, *, age_group: str) -> QuestionDifficulty:
    normalized = str(age_group or "").strip().lower()
    if normalized in {"6_8", "6-8", "age_6_8"}:
        return QuestionDifficulty.EASY
    if normalized in {"9_11", "9-11", "9_12", "9-12", "age_9_11", "age_9_12"}:
        if difficulty == QuestionDifficulty.HARD:
            return QuestionDifficulty.MEDIUM
    return difficulty
