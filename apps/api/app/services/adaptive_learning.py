from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from hashlib import sha256
from string import Template
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    ChildProfile,
    GeneratedVariant,
    LearningSession,
    LearningSettings,
    Lesson,
    LessonProgress,
    LessonSkill,
    Question,
    QuestionDifficulty,
    QuestionResult,
    QuestionTemplate,
    QuestionTemplateType,
    QuestionType,
    QuestionVariant,
    Skill,
    Unit,
    UserQuestionHistory,
    UserLearningStreak,
    UserSkillMastery,
    UserLearningStatus,
)
from app.services.achievement_engine import evaluate_achievements_after_learning
from app.services.gamification import addXP, get_or_create_game_profile
from app.services.learning_energy import consume_wrong_answer_energy
from app.services.learning_retention import MissionDelta, SeasonBonus, get_active_season_bonus, track_mission_progress
from app.services.learning_streak import register_learning_lesson_completion

DEFAULT_MAX_DAILY_LEARNING_XP = 200
DEFAULT_MAX_LESSONS_PER_DAY = 5
DEFAULT_XP_MULTIPLIER = 1.0
THREE_STAR_BONUS_COINS = 10
ANTI_REPEAT_DAYS = 7

PT_NOUN_FORMS: dict[str, tuple[str, str]] = {
    "figurinhas": ("figurinha", "figurinhas"),
    "livros": ("livro", "livros"),
    "adesivos": ("adesivo", "adesivos"),
    "cartas": ("carta", "cartas"),
    "blocos": ("bloco", "blocos"),
    "blocos coloridos": ("bloco colorido", "blocos coloridos"),
    "bolinhas de gude": ("bolinha de gude", "bolinhas de gude"),
    "frutas": ("fruta", "frutas"),
}


@dataclass(slots=True)
class EffectiveLearningSettings:
    max_daily_learning_xp: int
    max_lessons_per_day: int
    difficulty_ceiling: QuestionDifficulty
    enable_spaced_repetition: bool
    enable_coins_rewards: bool
    xp_multiplier: float
    coins_enabled: bool
    enabled_subjects: dict[str, bool]


@dataclass(slots=True)
class FocusSkillPlan:
    skill_id: str
    mastery: float
    priority: float


@dataclass(slots=True)
class DifficultyMix:
    easy: float
    medium: float
    hard: float


@dataclass(slots=True)
class NextQuestionItem:
    question_id: str | None
    template_id: str | None
    generated_variant_id: str | None
    variant_id: str | None
    type: QuestionType
    prompt: str
    explanation: str | None
    skill_id: str
    metadata: dict[str, Any]


@dataclass(slots=True)
class NextQuestionsPlan:
    items: list[NextQuestionItem]
    focus_skills: list[FocusSkillPlan]
    difficulty_mix: DifficultyMix


@dataclass(slots=True)
class TrackQuestionAnswerResult:
    mastery: UserSkillMastery
    mastery_delta: float
    skill_id: str
    question_id: str | None
    template_id: str | None
    generated_variant_id: str | None


@dataclass(slots=True)
class FinishAdaptiveSessionResult:
    session: LearningSession
    stars: int
    accuracy: float
    xp_earned: int
    coins_earned: int
    leveled_up: bool
    profile_xp: int
    profile_level: int
    profile_coins: int
    unlocked_achievements: list[str]


class SeededRng:
    def __init__(self, seed_text: str) -> None:
        hashed = sha256(seed_text.encode("utf-8")).hexdigest()
        self._state = int(hashed[:16], 16) or 1

    def _next(self) -> int:
        self._state = (1103515245 * self._state + 12345) % (2**31)
        return self._state

    def random(self) -> float:
        return self._next() / float(2**31 - 1)

    def randint(self, min_value: int, max_value: int) -> int:
        if min_value >= max_value:
            return min_value
        return min_value + (self._next() % ((max_value - min_value) + 1))

    def choice(self, values: list[Any]) -> Any:
        if not values:
            return None
        return values[self._next() % len(values)]

    def weighted_choice(self, values: list[Any], weights: list[float]) -> Any:
        if not values or len(values) != len(weights):
            return self.choice(values)
        total = sum(max(0.0, float(item)) for item in weights)
        if total <= 0:
            return self.choice(values)
        pick = self.random() * total
        cursor = 0.0
        for value, weight in zip(values, weights, strict=True):
            cursor += max(0.0, float(weight))
            if pick <= cursor:
                return value
        return values[-1]


def _clamp_mastery(value: float) -> float:
    return max(0.0, min(1.0, value))


def _difficulty_factor(difficulty: QuestionDifficulty) -> float:
    if difficulty == QuestionDifficulty.EASY:
        return 0.8
    if difficulty == QuestionDifficulty.HARD:
        return 1.2
    return 1.0


def _difficulty_mix_for_mastery(mastery: float) -> DifficultyMix:
    if mastery < 0.35:
        return DifficultyMix(easy=0.70, medium=0.25, hard=0.05)
    if mastery <= 0.70:
        return DifficultyMix(easy=0.30, medium=0.50, hard=0.20)
    return DifficultyMix(easy=0.10, medium=0.45, hard=0.45)


def _cap_difficulty(
    difficulty: QuestionDifficulty,
    ceiling: QuestionDifficulty,
) -> QuestionDifficulty:
    order = {
        QuestionDifficulty.EASY: 1,
        QuestionDifficulty.MEDIUM: 2,
        QuestionDifficulty.HARD: 3,
    }
    return difficulty if order[difficulty] <= order[ceiling] else ceiling


def _subject_enabled(settings: EffectiveLearningSettings, subject_id: int | None) -> bool:
    if subject_id is None:
        return True
    enabled = settings.enabled_subjects or {}
    if str(subject_id) in enabled:
        return bool(enabled[str(subject_id)])
    key = f"subject:{subject_id}"
    if key in enabled:
        return bool(enabled[key])
    return True


def _resolve_tenant_single_child_id(db: Session, *, tenant_id: int) -> int | None:
    ids = db.scalars(
        select(ChildProfile.id)
        .where(
            ChildProfile.tenant_id == tenant_id,
            ChildProfile.deleted_at.is_(None),
        )
        .order_by(ChildProfile.id.asc())
    ).all()
    if len(ids) != 1:
        return None
    return int(ids[0])


def _default_settings() -> EffectiveLearningSettings:
    return EffectiveLearningSettings(
        max_daily_learning_xp=DEFAULT_MAX_DAILY_LEARNING_XP,
        max_lessons_per_day=DEFAULT_MAX_LESSONS_PER_DAY,
        difficulty_ceiling=QuestionDifficulty.HARD,
        enable_spaced_repetition=True,
        enable_coins_rewards=True,
        xp_multiplier=DEFAULT_XP_MULTIPLIER,
        coins_enabled=True,
        enabled_subjects={},
    )


def resolve_effective_learning_settings(db: Session, *, tenant_id: int | None) -> EffectiveLearningSettings:
    if tenant_id is None:
        return _default_settings()
    child_id = _resolve_tenant_single_child_id(db, tenant_id=tenant_id)
    if child_id is None:
        return _default_settings()

    row = db.scalar(
        select(LearningSettings).where(
            LearningSettings.tenant_id == tenant_id,
            LearningSettings.child_id == child_id,
        )
    )
    if row is None:
        return _default_settings()

    return EffectiveLearningSettings(
        max_daily_learning_xp=max(0, row.max_daily_learning_xp),
        max_lessons_per_day=max(0, row.max_lessons_per_day),
        difficulty_ceiling=row.difficulty_ceiling,
        enable_spaced_repetition=bool(row.enable_spaced_repetition),
        enable_coins_rewards=bool(row.enable_coins_rewards),
        xp_multiplier=max(0.0, float(row.xp_multiplier)),
        coins_enabled=bool(row.coins_enabled),
        enabled_subjects=row.enabled_subjects or {},
    )


def daily_completed_learning_lessons(db: Session, *, user_id: int) -> int:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    count = db.scalar(
        select(func.count(LearningSession.id)).where(
            LearningSession.user_id == user_id,
            LearningSession.lesson_id.is_not(None),
            LearningSession.ended_at >= start,
            LearningSession.ended_at < end,
        )
    )
    return int(count or 0)


def start_learning_session(
    db: Session,
    *,
    user_id: int,
    subject_id: int,
    unit_id: int | None,
    lesson_id: int | None,
) -> LearningSession:
    session = LearningSession(
        user_id=user_id,
        subject_id=subject_id,
        unit_id=unit_id,
        lesson_id=lesson_id,
        started_at=datetime.now(UTC),
    )
    db.add(session)
    db.flush()
    return session


def _resolve_focus_skill_ids(
    db: Session,
    *,
    subject_id: int | None,
    lesson_id: int | None,
    focus_skill_id: str | None,
) -> list[str]:
    if focus_skill_id is not None:
        return [focus_skill_id]
    if lesson_id is not None:
        ids = db.scalars(
            select(LessonSkill.skill_id).where(LessonSkill.lesson_id == lesson_id)
        ).all()
        if ids:
            return [str(item) for item in ids]
    if subject_id is not None:
        ids = db.scalars(
            select(Skill.id).where(Skill.subject_id == subject_id).order_by(Skill.order.asc())
        ).all()
        return [str(item) for item in ids]
    ids = db.scalars(select(Skill.id).order_by(Skill.order.asc())).all()
    return [str(item) for item in ids]


def _load_mastery_rows(
    db: Session,
    *,
    user_id: int,
    skill_ids: list[str],
) -> dict[str, UserSkillMastery]:
    if not skill_ids:
        return {}
    rows = db.scalars(
        select(UserSkillMastery).where(
            UserSkillMastery.user_id == user_id,
            UserSkillMastery.skill_id.in_(skill_ids),
        )
    ).all()
    return {str(row.skill_id): row for row in rows}


def _get_or_create_mastery(db: Session, *, user_id: int, skill_id: str) -> UserSkillMastery:
    row = db.scalar(
        select(UserSkillMastery).where(
            UserSkillMastery.user_id == user_id,
            UserSkillMastery.skill_id == skill_id,
        )
    )
    if row is not None:
        return row
    row = UserSkillMastery(
        user_id=user_id,
        skill_id=skill_id,
        mastery=0,
        streak_correct=0,
        streak_wrong=0,
    )
    db.add(row)
    db.flush()
    return row


def _pick_focus_skills(
    db: Session,
    *,
    user_id: int,
    skill_ids: list[str],
    now: datetime,
) -> list[FocusSkillPlan]:
    mastery_map = _load_mastery_rows(db, user_id=user_id, skill_ids=skill_ids)
    plans: list[FocusSkillPlan] = []
    for skill_id in skill_ids:
        mastery_row = mastery_map.get(skill_id)
        mastery_value = float(mastery_row.mastery) if mastery_row is not None else 0.0
        due = bool(mastery_row and mastery_row.next_review_at and mastery_row.next_review_at <= now)
        plans.append(
            FocusSkillPlan(
                skill_id=skill_id,
                mastery=mastery_value,
                priority=(1.0 - mastery_value) + (2.0 if due else 0.0),
            )
        )
    plans.sort(key=lambda item: item.priority, reverse=True)
    return plans[: min(5, max(3, len(plans)))]


def _render_template_str(value: str | None, variables: dict[str, Any]) -> str | None:
    if value is None:
        return None
    out = value
    for key, item in variables.items():
        out = out.replace(f"{{{{{key}}}}}", str(item))
    return Template(out).safe_substitute({k: str(v) for k, v in variables.items()})


def _noun_forms_pt(raw: str) -> tuple[str, str]:
    key = raw.strip().lower()
    if key in PT_NOUN_FORMS:
        return PT_NOUN_FORMS[key]
    if key.endswith("s") and len(key) > 1:
        return key[:-1], key
    return key, f"{key}s"


def _label_with_count_pt(count: int, raw_noun: str) -> str:
    singular, plural = _noun_forms_pt(raw_noun)
    return singular if abs(int(count)) == 1 else plural


def _generate_variables(*, spec: dict[str, Any], rng: SeededRng) -> dict[str, Any]:
    variables: dict[str, Any] = {}
    for key, definition in spec.items():
        if not isinstance(definition, dict):
            continue
        if "values" in definition and isinstance(definition["values"], list):
            values = list(definition["values"])
            weights = definition.get("weights")
            if isinstance(weights, list):
                variables[key] = rng.weighted_choice(values, [float(item) for item in weights])
            else:
                variables[key] = rng.choice(values)
            continue
        minimum = int(definition.get("min", 0))
        maximum = int(definition.get("max", minimum))
        variables[key] = rng.randint(minimum, maximum)

    if "a" in variables and "b" in variables:
        a = int(variables["a"])
        b = int(variables["b"])
        op = str(variables.get("op", "+"))
        if op == "+":
            variables["answer"] = a + b
        elif op == "-":
            if bool(spec.get("noNegative")) and b > a:
                a, b = b, a
            variables["a"] = a
            variables["b"] = b
            variables["answer"] = a - b
        elif op in ("*", "x"):
            variables["answer"] = a * b
        elif op == "/" and b != 0:
            variables["answer"] = a // b
        else:
            variables["answer"] = a + b
    return variables


def _render_metadata(
    *,
    renderer_spec: dict[str, Any],
    variables: dict[str, Any],
    rng: SeededRng,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {"variables": variables}
    correct_key = str(renderer_spec.get("correctKey", "answer"))
    correct_value = variables.get(correct_key)
    choices_spec = renderer_spec.get("choices")
    if isinstance(choices_spec, dict):
        count = max(2, int(choices_spec.get("count", 4)))
        strategy = str(choices_spec.get("strategy", "nearby_numbers"))
        if isinstance(correct_value, int) and strategy == "nearby_numbers":
            pool = {correct_value}
            while len(pool) < count:
                delta = rng.randint(1, 5)
                pool.add(correct_value + (delta if rng.random() > 0.5 else -delta))
            ordered = list(pool)
            for idx in range(len(ordered) - 1, 0, -1):
                swap_idx = rng.randint(0, idx)
                ordered[idx], ordered[swap_idx] = ordered[swap_idx], ordered[idx]
            choices = [{"id": str(i + 1), "label": str(v)} for i, v in enumerate(ordered[:count])]
            correct_id = next((item["id"] for item in choices if item["label"] == str(correct_value)), "1")
            metadata["choices"] = choices
            metadata["correctOptionId"] = correct_id
    if "answer" in variables:
        metadata["answer"] = variables["answer"]
    return metadata


def _variant_signature(variables: dict[str, Any]) -> str:
    raw = "|".join(f"{key}={variables[key]}" for key in sorted(variables.keys()))
    return sha256(raw.encode("utf-8")).hexdigest()[:24]


def generate_variant(
    db: Session,
    *,
    template: QuestionTemplate,
    user_id: int,
    day_bucket: str,
    attempt_index: int,
) -> GeneratedVariant:
    seed = sha256(f"{user_id}:{template.id}:{day_bucket}:{attempt_index}".encode("utf-8")).hexdigest()[:32]
    rng = SeededRng(seed)
    variables = _generate_variables(spec=template.generator_spec or {}, rng=rng)
    if isinstance(variables.get("context"), str):
        context = str(variables["context"])
        singular, plural = _noun_forms_pt(context)
        variables["contextSingular"] = singular
        variables["contextPlural"] = plural
        if "a" in variables:
            variables["contextA"] = _label_with_count_pt(int(variables["a"]), context)
        if "b" in variables:
            variables["contextB"] = _label_with_count_pt(int(variables["b"]), context)
        if "answer" in variables:
            variables["contextAnswer"] = _label_with_count_pt(int(variables["answer"]), context)

    prompt = _render_template_str(template.prompt_template, variables) or ""
    explanation = _render_template_str(template.explanation_template, variables)

    if template.template_type == QuestionTemplateType.MATH_WORDPROB:
        name = str(variables.get("name", "A criança"))
        a = int(variables.get("a", 0))
        b = int(variables.get("b", 0))
        answer = int(variables.get("answer", a + b))
        context = str(variables.get("context", "itens"))
        context_a = _label_with_count_pt(a, context)
        context_b = _label_with_count_pt(b, context)
        context_answer = _label_with_count_pt(answer, context)
        prompt = f"{name} tinha {a} {context_a} e ganhou {b} {context_b}. Quantos {context_answer} tem agora?"
        explanation = f"{name} somou {a} com {b} e chegou a {answer} {context_answer}."

    metadata = _render_metadata(renderer_spec=template.renderer_spec or {}, variables=variables, rng=rng)
    payload = {
        "variables": variables,
        "signature": _variant_signature(variables),
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


def _recent_template_signatures(
    db: Session,
    *,
    user_id: int,
    template_id: str,
    since: datetime,
) -> set[str]:
    rows = db.execute(
        select(GeneratedVariant.variant_data).where(
            GeneratedVariant.user_id == user_id,
            GeneratedVariant.template_id == template_id,
            GeneratedVariant.created_at >= since,
        )
    ).all()
    out: set[str] = set()
    for row in rows:
        data = row[0] or {}
        signature = data.get("signature")
        if isinstance(signature, str):
            out.add(signature)
    return out


def _recent_question_and_variant_ids(
    db: Session,
    *,
    user_id: int,
    since: datetime,
) -> tuple[set[str], set[str]]:
    rows = db.execute(
        select(UserQuestionHistory.question_id, UserQuestionHistory.variant_id).where(
            UserQuestionHistory.user_id == user_id,
            UserQuestionHistory.created_at >= since,
        )
    ).all()
    q_ids: set[str] = set()
    v_ids: set[str] = set()
    for q_id, v_id in rows:
        if q_id is not None:
            q_ids.add(str(q_id))
        if v_id is not None:
            v_ids.add(str(v_id))
    return q_ids, v_ids


def _build_question_item(*, question: Question, variant: QuestionVariant | None) -> NextQuestionItem:
    prompt = question.prompt
    explanation = question.explanation
    metadata = dict(question.metadata_json or {})
    if variant is not None:
        payload = variant.variant_data or {}
        prompt = str(payload.get("prompt", prompt))
        explanation = payload.get("explanation", explanation)
        metadata = dict(payload.get("metadata", metadata))
    return NextQuestionItem(
        question_id=str(question.id),
        template_id=None,
        generated_variant_id=None,
        variant_id=str(variant.id) if variant is not None else None,
        type=question.type,
        prompt=prompt,
        explanation=explanation if isinstance(explanation, str) else None,
        skill_id=str(question.skill_id),
        metadata=metadata,
    )


def _build_template_item(*, template: QuestionTemplate, generated_variant: GeneratedVariant) -> NextQuestionItem:
    payload = generated_variant.variant_data or {}
    metadata = dict(payload.get("metadata", {}))
    metadata["signature"] = payload.get("signature")
    prompt = str(payload.get("prompt", ""))
    explanation = payload.get("explanation") if isinstance(payload.get("explanation"), str) else None

    if template.template_type == QuestionTemplateType.MATH_WORDPROB:
        variables = payload.get("variables") if isinstance(payload.get("variables"), dict) else {}
        name = str(variables.get("name", "A criança"))
        a = int(variables.get("a", 0))
        b = int(variables.get("b", 0))
        answer = int(variables.get("answer", a + b))
        context = str(variables.get("context", "itens"))
        context_a = _label_with_count_pt(a, context)
        context_b = _label_with_count_pt(b, context)
        context_answer = _label_with_count_pt(answer, context)
        prompt = f"{name} tinha {a} {context_a} e ganhou {b} {context_b}. Quantos {context_answer} tem agora?"
        explanation = f"{name} somou {a} com {b} e chegou a {answer} {context_answer}."

    return NextQuestionItem(
        question_id=None,
        template_id=str(template.id),
        generated_variant_id=str(generated_variant.id),
        variant_id=None,
        type=QuestionType.TEMPLATE,
        prompt=prompt,
        explanation=explanation,
        skill_id=str(template.skill_id),
        metadata=metadata,
    )


def build_next_questions(
    db: Session,
    *,
    user_id: int,
    subject_id: int | None,
    lesson_id: int | None,
    focus_skill_id: str | None,
    force_difficulty: QuestionDifficulty | None,
    tenant_id: int | None,
    count: int,
) -> NextQuestionsPlan:
    now = datetime.now(UTC)
    safe_count = max(1, min(30, count))
    settings = resolve_effective_learning_settings(db, tenant_id=tenant_id)
    if not _subject_enabled(settings, subject_id):
        return NextQuestionsPlan(items=[], focus_skills=[], difficulty_mix=DifficultyMix(1.0, 0.0, 0.0))

    skill_ids = _resolve_focus_skill_ids(
        db,
        subject_id=subject_id,
        lesson_id=lesson_id,
        focus_skill_id=focus_skill_id,
    )
    focus_skills = _pick_focus_skills(db, user_id=user_id, skill_ids=skill_ids, now=now)
    if not focus_skills:
        return NextQuestionsPlan(items=[], focus_skills=[], difficulty_mix=DifficultyMix(1.0, 0.0, 0.0))

    avg_mastery = sum(item.mastery for item in focus_skills) / len(focus_skills)
    mix = _difficulty_mix_for_mastery(avg_mastery)
    since = now - timedelta(days=ANTI_REPEAT_DAYS)
    recent_qids, recent_vids = _recent_question_and_variant_ids(db, user_id=user_id, since=since)
    day_bucket = now.strftime("%Y-%m-%d")
    rng = SeededRng(f"{user_id}:{subject_id}:{lesson_id}:{day_bucket}:{safe_count}")
    out: list[NextQuestionItem] = []

    for idx in range(safe_count):
        skill_plan = focus_skills[idx % len(focus_skills)]
        if force_difficulty is not None:
            target_difficulty = _cap_difficulty(force_difficulty, settings.difficulty_ceiling)
        else:
            target_difficulty = _cap_difficulty(
                rng.weighted_choice(
                    [QuestionDifficulty.EASY, QuestionDifficulty.MEDIUM, QuestionDifficulty.HARD],
                    [mix.easy, mix.medium, mix.hard],
                )
                or QuestionDifficulty.MEDIUM,
                settings.difficulty_ceiling,
            )

        templates_query = (
            select(QuestionTemplate)
            .where(
                QuestionTemplate.skill_id == skill_plan.skill_id,
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
        templates = db.scalars(templates_query).all()

        picked = False
        for template in templates:
            used_signatures = _recent_template_signatures(
                db,
                user_id=user_id,
                template_id=str(template.id),
                since=since,
            )
            selected_variant: GeneratedVariant | None = None
            for attempt in range(6):
                candidate = generate_variant(
                    db,
                    template=template,
                    user_id=user_id,
                    day_bucket=day_bucket,
                    attempt_index=(idx * 10) + attempt,
                )
                signature = str((candidate.variant_data or {}).get("signature", ""))
                if signature and signature not in used_signatures:
                    selected_variant = candidate
                    break
                db.delete(candidate)
                db.flush()
            if selected_variant is not None:
                out.append(_build_template_item(template=template, generated_variant=selected_variant))
                picked = True
                break
        if picked:
            continue

        q_query = (
            select(Question)
            .where(
                Question.skill_id == skill_plan.skill_id,
                Question.type != QuestionType.TEMPLATE,
                Question.difficulty == target_difficulty,
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
                        select(Lesson.id)
                        .join(Unit, Unit.id == Lesson.unit_id)
                        .where(Unit.subject_id == subject_id)
                    ),
                )
            )
        questions = db.scalars(q_query).all()
        if not questions:
            continue

        chosen = next((item for item in questions if str(item.id) not in recent_qids), questions[0])
        variants = db.scalars(select(QuestionVariant).where(QuestionVariant.question_id == chosen.id)).all()
        variant = next((item for item in variants if str(item.id) not in recent_vids), variants[0] if variants else None)
        out.append(_build_question_item(question=chosen, variant=variant))

    return NextQuestionsPlan(items=out, focus_skills=focus_skills, difficulty_mix=mix)


def _resolve_answer_target(
    db: Session,
    *,
    question_id: str | None,
    template_id: str | None,
    generated_variant_id: str | None,
    variant_id: str | None,
) -> tuple[str, QuestionDifficulty]:
    if question_id is not None:
        question = db.get(Question, question_id)
        if question is None:
            raise ValueError("Question not found")
        difficulty = question.difficulty
        if variant_id is not None:
            variant = db.get(QuestionVariant, variant_id)
            if variant is None or str(variant.question_id) != str(question.id):
                raise ValueError("Variant not found for question")
            if variant.difficulty_override is not None:
                difficulty = variant.difficulty_override
        return str(question.skill_id), difficulty
    if template_id is None or generated_variant_id is None:
        raise ValueError("questionId or (templateId + generatedVariantId) is required")
    template = db.get(QuestionTemplate, template_id)
    if template is None:
        raise ValueError("Question template not found")
    generated = db.get(GeneratedVariant, generated_variant_id)
    if generated is None or str(generated.template_id) != str(template.id):
        raise ValueError("Generated variant not found for template")
    return str(template.skill_id), template.difficulty


def track_question_answer(
    db: Session,
    *,
    user_id: int,
    question_id: str | None,
    template_id: str | None,
    generated_variant_id: str | None,
    variant_id: str | None,
    result: QuestionResult,
    time_ms: int,
    tenant_id: int | None,
) -> TrackQuestionAnswerResult:
    now = datetime.now(UTC)
    settings = resolve_effective_learning_settings(db, tenant_id=tenant_id)
    skill_id, served_difficulty = _resolve_answer_target(
        db,
        question_id=question_id,
        template_id=template_id,
        generated_variant_id=generated_variant_id,
        variant_id=variant_id,
    )
    if result == QuestionResult.WRONG:
        consume_wrong_answer_energy(db, user_id=user_id)

    mastery = _get_or_create_mastery(db, user_id=user_id, skill_id=skill_id)
    prev = float(mastery.mastery)
    factor = _difficulty_factor(served_difficulty)
    if result == QuestionResult.CORRECT:
        mastery.mastery = _clamp_mastery(prev + (0.06 * factor))
        mastery.streak_correct += 1
        mastery.streak_wrong = 0
    elif result == QuestionResult.WRONG:
        mastery.mastery = _clamp_mastery(prev - (0.08 * factor))
        mastery.streak_wrong += 1
        mastery.streak_correct = 0
    mastery.last_seen_at = now

    if settings.enable_spaced_repetition:
        if result == QuestionResult.CORRECT:
            m = float(mastery.mastery)
            days = 1 if m < 0.3 else 3 if m <= 0.6 else 7 if m <= 0.8 else 14
            mastery.next_review_at = now + timedelta(days=days)
        elif result == QuestionResult.WRONG:
            mastery.next_review_at = now
    else:
        mastery.next_review_at = None

    history = UserQuestionHistory(
        user_id=user_id,
        question_id=question_id,
        template_id=template_id,
        generated_variant_id=generated_variant_id,
        variant_id=variant_id,
        result=result,
        time_ms=max(0, int(time_ms)),
        difficulty_served=served_difficulty,
    )
    db.add(history)
    db.flush()
    return TrackQuestionAnswerResult(
        mastery=mastery,
        mastery_delta=float(mastery.mastery) - prev,
        skill_id=skill_id,
        question_id=question_id,
        template_id=template_id,
        generated_variant_id=generated_variant_id,
    )


def _upsert_lesson_progress(
    db: Session,
    *,
    user_id: int,
    lesson_id: int,
    accuracy: float,
    xp_granted: int,
) -> None:
    row = db.scalar(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id,
            LessonProgress.lesson_id == lesson_id,
        )
    )
    score = max(0, min(100, int(round(accuracy * 100))))
    completed = score >= 60
    now = datetime.now(UTC)
    if row is None:
        db.add(
            LessonProgress(
                user_id=user_id,
                lesson_id=lesson_id,
                completed=completed,
                score=score,
                xp_granted=xp_granted if completed else 0,
                attempts=1,
                repeat_required=not completed,
                completed_at=now if completed else None,
            )
        )
        db.flush()
        return
    row.attempts += 1
    row.score = score
    row.completed = completed
    row.repeat_required = not completed
    row.completed_at = now if completed else None
    if completed:
        row.xp_granted = max(row.xp_granted, xp_granted)
    db.flush()


def finish_adaptive_learning_session(
    db: Session,
    *,
    user_id: int,
    session_id: str,
    total_questions: int,
    correct_count: int,
    tenant_id: int | None,
) -> FinishAdaptiveSessionResult:
    session = db.get(LearningSession, session_id)
    if session is None:
        raise ValueError("Learning session not found")
    if session.user_id != user_id:
        raise ValueError("Session does not belong to this user")
    if session.ended_at is not None:
        raise ValueError("Session already finished")

    safe_total = max(0, int(total_questions))
    safe_correct = max(0, min(int(correct_count), safe_total))
    accuracy = (safe_correct / safe_total) if safe_total > 0 else 0.0
    stars = 3 if accuracy >= 0.85 else 2 if accuracy >= 0.70 else 1

    settings = resolve_effective_learning_settings(db, tenant_id=tenant_id)
    profile = get_or_create_game_profile(db, user_id=user_id)
    xp_before = profile.xp
    level_before = profile.level
    coins_before = profile.axion_coins
    try:
        season_bonus = get_active_season_bonus(db)
    except SQLAlchemyError:
        db.rollback()
        season_bonus = SeasonBonus(xp_multiplier=1.0, coin_multiplier=1.0, active_theme_key=None)

    boost_multiplier = 1.0
    learning_status = db.scalar(select(UserLearningStatus).where(UserLearningStatus.user_id == user_id))
    now = datetime.now(UTC)
    if (
        learning_status is not None
        and learning_status.event_boost_expires_at is not None
        and learning_status.event_boost_expires_at > now
    ):
        boost_multiplier = max(1.0, float(learning_status.event_boost_multiplier))
    requested_xp = max(0, int(round((safe_total * 8) * settings.xp_multiplier * boost_multiplier * season_bonus.xp_multiplier)))
    if stars == 2:
        requested_xp += 6
    elif stars == 3:
        requested_xp += 12
    addXP(
        db,
        user_id=user_id,
        xp_amount=requested_xp,
        target_date=date.today(),
        max_xp_per_day=settings.max_daily_learning_xp,
    )

    if settings.enable_coins_rewards and settings.coins_enabled and stars == 3:
        profile.axion_coins += max(0, int(round(THREE_STAR_BONUS_COINS * season_bonus.coin_multiplier)))

    session.ended_at = datetime.now(UTC)
    session.total_questions = safe_total
    session.correct_count = safe_correct
    session.xp_earned = max(0, profile.xp - xp_before)
    session.coins_earned = max(0, profile.axion_coins - coins_before)

    streak_days_delta = 0
    if session.lesson_id is not None:
        _upsert_lesson_progress(
            db,
            user_id=user_id,
            lesson_id=session.lesson_id,
            accuracy=accuracy,
            xp_granted=session.xp_earned,
        )
        if accuracy >= 0.60:
            streak_row = db.scalar(select(UserLearningStreak).where(UserLearningStreak.user_id == user_id))
            already_had_today = bool(streak_row is not None and streak_row.last_lesson_date == session.ended_at.date())
            register_learning_lesson_completion(db, user_id=user_id, completion_at=session.ended_at)
            streak_days_delta = 0 if already_had_today else 1

    unlocked = evaluate_achievements_after_learning(
        db,
        user_id=user_id,
        profile=profile,
        stars=stars,
    )
    try:
        track_mission_progress(
            db,
            user_id=user_id,
            tenant_id=tenant_id,
            delta=MissionDelta(
                lessons_completed=1 if session.lesson_id is not None and accuracy >= 0.60 else 0,
                xp_gained=session.xp_earned,
                perfect_scores=1 if stars == 3 else 0,
                streak_days=streak_days_delta,
            ),
            auto_claim=True,
        )
    except SQLAlchemyError:
        db.rollback()
    db.flush()
    return FinishAdaptiveSessionResult(
        session=session,
        stars=stars,
        accuracy=accuracy,
        xp_earned=session.xp_earned,
        coins_earned=session.coins_earned,
        leveled_up=profile.level > level_before,
        profile_xp=profile.xp,
        profile_level=profile.level,
        profile_coins=profile.axion_coins,
        unlocked_achievements=unlocked,
    )
