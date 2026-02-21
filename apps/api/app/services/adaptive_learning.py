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
    AxionDecision,
    AxionDecisionContext,
    AxionSignalType,
    ChildProfile,
    GeneratedVariant,
    LearningSession,
    LLMUsageStatus,
    LLMUseCase,
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
    SubjectAgeGroup,
    Unit,
    UserQuestionHistory,
    UserLearningStreak,
    UserSkillMastery,
)
from app.services.achievement_engine import evaluate_achievements_after_learning
from app.services.axion_core_v2 import (
    compute_axion_state,
    decide_axion_actions,
    evaluate_policies,
    record_axion_signal,
)
from app.services.axion_effects import (
    apply_actions_to_temporary_boosts,
    get_difficulty_cap_boost,
    get_energy_discount_multiplier,
    get_xp_multiplier_boost,
)
from app.services.axion_facts import build_axion_facts
from app.services.axion_messaging import generate_axion_message
from app.services.gamification import addXP, get_or_create_game_profile
from app.services.llm_gate import llmGate, log_llm_usage
from app.services.llm_provider import get_llm_provider
from app.services.learning_energy import consume_wrong_answer_energy
from app.services.learning_retention import (
    MissionDelta,
    SeasonBonus,
    get_active_season_bonus,
    inject_axion_micro_mission,
    track_mission_progress,
)
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

AGE_PROMPT_LIMITS: dict[SubjectAgeGroup, int] = {
    SubjectAgeGroup.AGE_6_8: 160,
    SubjectAgeGroup.AGE_9_12: 220,
    SubjectAgeGroup.AGE_13_15: 260,
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
    difficulty: QuestionDifficulty
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


def _normalize_mix(easy: float, medium: float, hard: float) -> DifficultyMix:
    safe_easy = max(0.01, float(easy))
    safe_medium = max(0.01, float(medium))
    safe_hard = max(0.01, float(hard))
    total = safe_easy + safe_medium + safe_hard
    return DifficultyMix(
        easy=safe_easy / total,
        medium=safe_medium / total,
        hard=safe_hard / total,
    )


def _apply_difficulty_ratio_boosts(
    *,
    mix: DifficultyMix,
    easy_boost: float,
    hard_boost: float,
) -> DifficultyMix:
    easy = float(mix.easy)
    medium = float(mix.medium)
    hard = float(mix.hard)
    if easy_boost != 0.0:
        easy += easy_boost
        medium -= easy_boost * 0.5
        hard -= easy_boost * 0.5
    if hard_boost != 0.0:
        hard += hard_boost
        medium -= hard_boost * 0.5
        easy -= hard_boost * 0.5
    return _normalize_mix(easy, medium, hard)


def _effective_ceiling(settings_ceiling: QuestionDifficulty, boost_cap: QuestionDifficulty | None) -> QuestionDifficulty:
    if boost_cap is None:
        return settings_ceiling
    order = {
        QuestionDifficulty.EASY: 1,
        QuestionDifficulty.MEDIUM: 2,
        QuestionDifficulty.HARD: 3,
    }
    return boost_cap if order[boost_cap] <= order[settings_ceiling] else settings_ceiling


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
    tenant_id: int | None = None,
) -> LearningSession:
    state = compute_axion_state(db, user_id=user_id)
    facts = build_axion_facts(db, user_id=user_id)
    actions, _ = evaluate_policies(
        db,
        state=state,
        context=AxionDecisionContext.BEFORE_LEARNING,
        extra={
            "dueReviews": int(facts.due_reviews_count),
            "weeklyCompletionRate": float(facts.weekly_completion_rate),
            "streakDays": int(facts.streak_days),
            "energyCurrent": int(facts.energy.current),
            "recentApproved": int(facts.recent_approvals.approved),
            "recentRejected": int(facts.recent_approvals.rejected),
        },
        user_id=user_id,
    )
    apply_actions_to_temporary_boosts(db, user_id=user_id, actions=actions)
    for action in actions:
        action_type = str(action.get("type", "")).strip().upper()
        if action_type not in {"OFFER_MICRO_MISSION", "INSERT_MICRO_MISSION"}:
            continue
        params = action.get("params", {}) if isinstance(action.get("params"), dict) else {}
        mission_kind_raw = params.get("missionKind")
        inject_axion_micro_mission(
            db,
            user_id=user_id,
            tenant_id=tenant_id,
            mission_kind=str(mission_kind_raw) if mission_kind_raw else None,
        )
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
    force_due_reviews: bool = False,
) -> list[FocusSkillPlan]:
    mastery_map = _load_mastery_rows(db, user_id=user_id, skill_ids=skill_ids)
    plans: list[FocusSkillPlan] = []
    due_plans: list[FocusSkillPlan] = []
    for skill_id in skill_ids:
        mastery_row = mastery_map.get(skill_id)
        mastery_value = float(mastery_row.mastery) if mastery_row is not None else 0.0
        due = bool(mastery_row and mastery_row.next_review_at and mastery_row.next_review_at <= now)
        plan = FocusSkillPlan(
            skill_id=skill_id,
            mastery=mastery_value,
            priority=(1.0 - mastery_value) + (2.0 if due else 0.0),
        )
        plans.append(plan)
        if due:
            due_plans.append(plan)
    if force_due_reviews and due_plans:
        due_plans.sort(key=lambda item: item.priority, reverse=True)
        return due_plans[: min(5, max(3, len(due_plans)))]

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


def _resolve_template_age_group(db: Session, *, template: QuestionTemplate) -> SubjectAgeGroup:
    skill = db.get(Skill, str(template.skill_id))
    if skill is None:
        return SubjectAgeGroup.AGE_9_12
    return skill.age_group


def _matches_generator_spec(variables: dict[str, Any], spec: dict[str, Any]) -> bool:
    for key, definition in spec.items():
        if not isinstance(definition, dict):
            continue
        if key not in variables:
            return False
        value = variables.get(key)
        if "values" in definition and isinstance(definition.get("values"), list):
            allowed = {str(item) for item in definition.get("values", [])}
            if str(value) not in allowed:
                return False
            continue
        if "min" in definition or "max" in definition:
            try:
                numeric = int(value)
            except (TypeError, ValueError):
                return False
            min_value = int(definition.get("min", numeric))
            max_value = int(definition.get("max", numeric))
            if numeric < min_value or numeric > max_value:
                return False
    if bool(spec.get("noNegative")):
        answer = variables.get("answer")
        try:
            if answer is not None and int(answer) < 0:
                return False
        except (TypeError, ValueError):
            return False
    return True


def _has_correct_answer(metadata: dict[str, Any]) -> bool:
    if any(key in metadata for key in ("answer", "correctAnswer", "correctValue", "correctOptionId")):
        return True
    choices = metadata.get("choices")
    if isinstance(choices, list):
        for item in choices:
            if isinstance(item, dict) and bool(item.get("isCorrect")):
                return True
    return False


def _age_appropriate_variant(*, prompt: str, explanation: str | None, age_group: SubjectAgeGroup) -> bool:
    limit = AGE_PROMPT_LIMITS.get(age_group, 220)
    if len(prompt.strip()) == 0 or len(prompt) > limit:
        return False
    if explanation is not None and len(explanation) > (limit + 40):
        return False
    if age_group == SubjectAgeGroup.AGE_6_8:
        words = prompt.split()
        if len(words) > 30:
            return False
        if any(len(word) > 14 for word in words):
            return False
    return True


def _to_generated_variant_payload(
    *,
    template: QuestionTemplate,
    variant: dict[str, Any],
) -> tuple[str, str | None, dict[str, Any], dict[str, Any], str] | None:
    if not isinstance(variant, dict):
        return None
    prompt = str(variant.get("prompt", "")).strip()
    explanation_raw = variant.get("explanation")
    explanation = str(explanation_raw).strip() if isinstance(explanation_raw, str) else None
    metadata = variant.get("metadata")
    metadata_obj = dict(metadata) if isinstance(metadata, dict) else {}
    variables_raw = variant.get("variables")
    variables = dict(variables_raw) if isinstance(variables_raw, dict) else {}
    if not variables:
        if isinstance(metadata_obj.get("variables"), dict):
            variables = dict(metadata_obj.get("variables"))
    if "answer" not in variables and "answer" in metadata_obj:
        variables["answer"] = metadata_obj.get("answer")
    if not prompt:
        return None
    signature = str(variant.get("signature") or _variant_signature(variables or {"prompt": prompt}))
    if not signature:
        signature = sha256(prompt.encode("utf-8")).hexdigest()[:24]
    return prompt, explanation, metadata_obj, variables, signature


def _generate_llm_variants_for_template(
    db: Session,
    *,
    tenant_id: int | None,
    user_id: int,
    template: QuestionTemplate,
    used_signatures: set[str],
    day_bucket: str,
    count: int = 5,
) -> list[GeneratedVariant]:
    if tenant_id is None:
        return []
    gate = llmGate.canCall(
        db,
        tenantId=tenant_id,
        userId=user_id,
        useCase=LLMUseCase.GENERATE_VARIANTS,
    )
    constraints = {
        "count": max(1, min(10, int(count))),
        "generatorSpec": template.generator_spec or {},
        "rendererSpec": template.renderer_spec or {},
        "difficulty": template.difficulty.value if hasattr(template.difficulty, "value") else str(template.difficulty),
        "templateType": template.template_type.value if hasattr(template.template_type, "value") else str(template.template_type),
    }
    prompt_input = {
        "template": {
            "id": str(template.id),
            "promptTemplate": template.prompt_template,
            "explanationTemplate": template.explanation_template,
        },
        "n": max(1, min(10, int(count))),
        "constraints": constraints,
    }
    prompt_repr = str(prompt_input)
    cache_key = f"axion:variants:{template.id}:{day_bucket}"
    if not gate.allowed:
        log_llm_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            use_case=LLMUseCase.GENERATE_VARIANTS,
            prompt=prompt_repr,
            cache_key=cache_key,
            tokens_estimated=0,
            latency_ms=0,
            status=LLMUsageStatus.BLOCKED,
        )
        return []

    provider = get_llm_provider(gate.settings.provider_key if gate.settings is not None else "noop")
    start_time = datetime.now(UTC)
    try:
        raw_variants = provider.generateVariants(prompt_input)
        latency_ms = max(0, int((datetime.now(UTC) - start_time).total_seconds() * 1000))
    except Exception:
        log_llm_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            use_case=LLMUseCase.GENERATE_VARIANTS,
            prompt=prompt_repr,
            cache_key=cache_key,
            tokens_estimated=max(1, len(prompt_repr) // 4),
            latency_ms=max(0, int((datetime.now(UTC) - start_time).total_seconds() * 1000)),
            status=LLMUsageStatus.FAILED,
        )
        return []

    if not isinstance(raw_variants, list) or not raw_variants:
        log_llm_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            use_case=LLMUseCase.GENERATE_VARIANTS,
            prompt=prompt_repr,
            cache_key=cache_key,
            tokens_estimated=max(1, len(prompt_repr) // 4),
            latency_ms=latency_ms,
            status=LLMUsageStatus.MISS,
        )
        return []

    age_group = _resolve_template_age_group(db, template=template)
    accepted: list[GeneratedVariant] = []
    fallback_count = 0
    for item in raw_variants[: max(1, min(10, int(count) * 2))]:
        unpacked = _to_generated_variant_payload(template=template, variant=item)
        if unpacked is None:
            fallback_count += 1
            continue
        prompt, explanation, metadata, variables, signature = unpacked
        if signature in used_signatures:
            continue
        if not _matches_generator_spec(variables, template.generator_spec or {}):
            fallback_count += 1
            continue
        metadata["variables"] = variables
        if not _has_correct_answer(metadata):
            fallback_count += 1
            continue
        if not _age_appropriate_variant(prompt=prompt, explanation=explanation, age_group=age_group):
            fallback_count += 1
            continue
        payload = {
            "variables": variables,
            "signature": signature,
            "prompt": prompt,
            "explanation": explanation,
            "metadata": metadata,
        }
        row = GeneratedVariant(
            user_id=user_id,
            template_id=template.id,
            seed=f"llm:{sha256(f'{template.id}:{signature}:{day_bucket}'.encode('utf-8')).hexdigest()[:32]}",
            variant_data=payload,
        )
        db.add(row)
        db.flush()
        accepted.append(row)
        used_signatures.add(signature)
        if len(accepted) >= int(count):
            break

    if not accepted and fallback_count > 0:
        status = LLMUsageStatus.FALLBACK
    else:
        status = LLMUsageStatus.HIT if accepted else LLMUsageStatus.MISS
    log_llm_usage(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        use_case=LLMUseCase.GENERATE_VARIANTS,
        prompt=prompt_repr,
        cache_key=cache_key,
        tokens_estimated=max(1, len(prompt_repr) // 4) + (len(accepted) * 20),
        latency_ms=latency_ms,
        status=status,
    )
    return accepted


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
    difficulty = question.difficulty
    if variant is not None:
        payload = variant.variant_data or {}
        prompt = str(payload.get("prompt", prompt))
        explanation = payload.get("explanation", explanation)
        metadata = dict(payload.get("metadata", metadata))
        if variant.difficulty_override is not None:
            difficulty = variant.difficulty_override
    return NextQuestionItem(
        question_id=str(question.id),
        template_id=None,
        generated_variant_id=None,
        variant_id=str(variant.id) if variant is not None else None,
        type=question.type,
        prompt=prompt,
        explanation=explanation if isinstance(explanation, str) else None,
        skill_id=str(question.skill_id),
        difficulty=difficulty,
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
        difficulty=template.difficulty,
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
    boost_cap, ratio_boosts, trigger_review = get_difficulty_cap_boost(db, user_id=user_id)
    effective_ceiling = _effective_ceiling(settings.difficulty_ceiling, boost_cap)

    skill_ids = _resolve_focus_skill_ids(
        db,
        subject_id=subject_id,
        lesson_id=lesson_id,
        focus_skill_id=focus_skill_id,
    )
    focus_skills = _pick_focus_skills(
        db,
        user_id=user_id,
        skill_ids=skill_ids,
        now=now,
        force_due_reviews=trigger_review,
    )
    if not focus_skills:
        return NextQuestionsPlan(items=[], focus_skills=[], difficulty_mix=DifficultyMix(1.0, 0.0, 0.0))

    avg_mastery = sum(item.mastery for item in focus_skills) / len(focus_skills)
    mix = _apply_difficulty_ratio_boosts(
        mix=_difficulty_mix_for_mastery(avg_mastery),
        easy_boost=float(ratio_boosts.get("easyRatioBoost", 0.0)),
        hard_boost=float(ratio_boosts.get("hardRatioBoost", 0.0)),
    )
    since = now - timedelta(days=ANTI_REPEAT_DAYS)
    recent_qids, recent_vids = _recent_question_and_variant_ids(db, user_id=user_id, since=since)
    day_bucket = now.strftime("%Y-%m-%d")
    rng = SeededRng(f"{user_id}:{subject_id}:{lesson_id}:{day_bucket}:{safe_count}")
    out: list[NextQuestionItem] = []

    for idx in range(safe_count):
        skill_plan = focus_skills[idx % len(focus_skills)]
        if force_difficulty is not None:
            target_difficulty = _cap_difficulty(force_difficulty, effective_ceiling)
        else:
            target_difficulty = _cap_difficulty(
                rng.weighted_choice(
                    [QuestionDifficulty.EASY, QuestionDifficulty.MEDIUM, QuestionDifficulty.HARD],
                    [mix.easy, mix.medium, mix.hard],
                )
                or QuestionDifficulty.MEDIUM,
                effective_ceiling,
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
            if selected_variant is None:
                llm_generated = _generate_llm_variants_for_template(
                    db,
                    tenant_id=tenant_id,
                    user_id=user_id,
                    template=template,
                    used_signatures=used_signatures,
                    day_bucket=day_bucket,
                    count=5,
                )
                if llm_generated:
                    selected_variant = llm_generated[0]
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
        discount_multiplier = get_energy_discount_multiplier(db, user_id=user_id)
        energy_cost = 0 if discount_multiplier <= 0.5 else 1
        consume_wrong_answer_energy(db, user_id=user_id, cost=energy_cost)

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
    previously_completed = bool(row.completed)
    previous_best_score = int(row.score or 0)
    row.attempts += 1
    # Mantem o melhor score para evitar "desconcluir" uma licao apos retries piores.
    row.score = max(previous_best_score, score)
    row.completed = previously_completed or completed
    row.repeat_required = not row.completed
    if row.completed and row.completed_at is None:
        row.completed_at = now
    if completed or previously_completed:
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
    xp_boost_multiplier = get_xp_multiplier_boost(db, user_id=user_id)
    requested_xp = max(
        0,
        int(round((safe_total * 8) * settings.xp_multiplier * season_bonus.xp_multiplier * xp_boost_multiplier)),
    )
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
        # Isola erros de missao para nao perder progresso principal da sessao.
        with db.begin_nested():
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
        pass
    signal_type = AxionSignalType.LESSON_COMPLETED if accuracy >= 0.60 else AxionSignalType.LESSON_FAILED
    record_axion_signal(
        db,
        user_id=user_id,
        signal_type=signal_type,
        payload={
            "sessionId": session.id,
            "lessonId": session.lesson_id,
            "unitId": session.unit_id,
            "subjectId": session.subject_id,
            "accuracy": round(accuracy, 4),
            "stars": stars,
            "xpEarned": session.xp_earned,
            "coinsEarned": session.coins_earned,
        },
    )
    updated_state = compute_axion_state(db, user_id=user_id)
    post_facts = build_axion_facts(db, user_id=user_id)
    post_actions_snapshot = decide_axion_actions(
        db,
        user_id=user_id,
        context=AxionDecisionContext.AFTER_LEARNING,
    )
    apply_actions_to_temporary_boosts(db, user_id=user_id, actions=post_actions_snapshot.actions)
    for action in post_actions_snapshot.actions:
        action_type = str(action.get("type", "")).strip().upper()
        params = action.get("params", {}) if isinstance(action.get("params"), dict) else {}
        if action_type == "SURPRISE_REWARD":
            if not (settings.enable_coins_rewards and settings.coins_enabled):
                continue
            reward_coins = int(params.get("coins", params.get("value", 5)) or 5)
            reward_coins = max(0, min(100, reward_coins))
            if reward_coins > 0:
                profile.axion_coins += reward_coins
                session.coins_earned += reward_coins
        if action_type == "NUDGE_PARENT":
            db.add(
                AxionDecision(
                    user_id=user_id,
                    context=AxionDecisionContext.AFTER_LEARNING,
                    decisions=[action],
                    primary_message_key="axion.after_learning.nudge_parent",
                    debug={
                        "source": "adaptive_learning.finish_session",
                        "reason": "post_session_policy",
                        "facts": post_facts.to_dict(),
                    },
                )
            )
    try:
        generate_axion_message(
            db,
            user_id=user_id,
            context="after_learning",
            state=updated_state,
            recent_facts={
                "stars": stars,
                "xp": session.xp_earned,
                "coins": session.coins_earned,
            },
        )
    except Exception:
        pass
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
