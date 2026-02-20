from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AxionMessageHistory,
    AxionMessageTemplate,
    AxionMessageTone,
    AxionUserState,
    LearningSession,
    Lesson,
    Skill,
    Unit,
    User,
    UserGameProfile,
    UserLearningStreak,
    UserSkillMastery,
)
from app.services.axion_facts import build_axion_facts
from app.services.axion_core_v2 import compute_axion_state
from app.services.axion_persona import resolve_user_persona

_PLACEHOLDER_PATTERN = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")

_SYNONYMS: dict[str, list[str]] = {
    "mandou bem": ["mandou bem", "boa", "excelente", "show"],
    "vamos": ["vamos", "bora", "partiu"],
    "continue": ["continue", "siga", "va em frente"],
}


@dataclass(slots=True)
class AxionMessageSnapshot:
    template_id: int
    tone: str
    message: str


def _normalize_context(value: str) -> str:
    context = (value or "").strip().lower()
    mapping = {
        "learning": "before_learning",
        "games": "games_tab",
        "wallet": "wallet_tab",
        "any": "child_tab",
    }
    return mapping.get(context, context if context else "child_tab")


def _safe_message(text_value: str) -> str:
    return " ".join(text_value.split())[:220]


def _seed_int(*parts: str) -> int:
    raw = ":".join(parts)
    return int(hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12], 16)


def _weighted_pick(items: list[AxionMessageTemplate], *, seed: int) -> AxionMessageTemplate:
    total = sum(max(1, int(item.weight)) for item in items)
    if total <= 0:
        return items[seed % len(items)]
    pick = seed % total
    cursor = 0
    for item in items:
        cursor += max(1, int(item.weight))
        if pick < cursor:
            return item
    return items[-1]


def _tone_order(state: Any | None, tone_bias: str | None = None) -> list[AxionMessageTone]:
    if state is None:
        return [AxionMessageTone.ENCOURAGE, AxionMessageTone.SUPPORT, AxionMessageTone.CALM, AxionMessageTone.CHALLENGE, AxionMessageTone.CELEBRATE]
    frustration = float(getattr(state, "frustration_score", getattr(state, "frustrationScore", 0.0)))
    confidence = float(getattr(state, "confidence_score", getattr(state, "confidenceScore", 0.0)))
    if frustration >= 0.7:
        ordered = [AxionMessageTone.CALM, AxionMessageTone.SUPPORT, AxionMessageTone.ENCOURAGE, AxionMessageTone.CELEBRATE, AxionMessageTone.CHALLENGE]
    elif confidence >= 0.8:
        ordered = [AxionMessageTone.CHALLENGE, AxionMessageTone.CELEBRATE, AxionMessageTone.ENCOURAGE, AxionMessageTone.SUPPORT, AxionMessageTone.CALM]
    else:
        ordered = [AxionMessageTone.ENCOURAGE, AxionMessageTone.SUPPORT, AxionMessageTone.CALM, AxionMessageTone.CHALLENGE, AxionMessageTone.CELEBRATE]
    if tone_bias and tone_bias in AxionMessageTone.__members__:
        preferred = AxionMessageTone[tone_bias]
        if preferred in ordered:
            ordered = [preferred, *[tone for tone in ordered if tone != preferred]]
    return ordered


def _condition_match(value: Any, expression: dict[str, Any]) -> bool:
    for op, expected in expression.items():
        if op == "gt" and not (float(value) > float(expected)):
            return False
        if op == "gte" and not (float(value) >= float(expected)):
            return False
        if op == "lt" and not (float(value) < float(expected)):
            return False
        if op == "lte" and not (float(value) <= float(expected)):
            return False
        if op == "eq" and value != expected:
            return False
        if op == "in":
            if not isinstance(expected, list) or value not in expected:
                return False
    return True


def _matches_conditions(template: AxionMessageTemplate, *, state_dict: dict[str, Any], facts: dict[str, Any]) -> bool:
    conditions = template.conditions if isinstance(template.conditions, dict) else {}
    for key, expression in conditions.items():
        source = facts if key in facts else state_dict
        if key not in source:
            return False
        value = source[key]
        if isinstance(expression, dict):
            if not _condition_match(value, expression):
                return False
        elif value != expression:
            return False
    return True


def _recent_template_ids(db: Session, *, user_id: int, limit: int = 5) -> list[int]:
    rows = db.scalars(
        select(AxionMessageHistory)
        .where(AxionMessageHistory.user_id == user_id)
        .order_by(AxionMessageHistory.used_at.desc())
        .limit(limit)
    ).all()
    return [int(row.template_id) for row in rows]


def _skill_names(db: Session, *, user_id: int) -> tuple[str, str]:
    weak = db.execute(
        select(Skill.name)
        .select_from(UserSkillMastery)
        .join(Skill, Skill.id == UserSkillMastery.skill_id)
        .where(UserSkillMastery.user_id == user_id)
        .order_by(UserSkillMastery.mastery.asc(), Skill.order.asc())
        .limit(1)
    ).scalar_one_or_none()
    strong = db.execute(
        select(Skill.name)
        .select_from(UserSkillMastery)
        .join(Skill, Skill.id == UserSkillMastery.skill_id)
        .where(UserSkillMastery.user_id == user_id)
        .order_by(UserSkillMastery.mastery.desc(), Skill.order.asc())
        .limit(1)
    ).scalar_one_or_none()
    return str(weak or "este tema"), str(strong or "seu ponto forte")


def _last_lesson_unit(db: Session, *, user_id: int) -> tuple[str, str]:
    row = db.execute(
        select(Lesson.title, Unit.title)
        .select_from(LearningSession)
        .join(Lesson, Lesson.id == LearningSession.lesson_id, isouter=True)
        .join(Unit, Unit.id == LearningSession.unit_id, isouter=True)
        .where(
            LearningSession.user_id == user_id,
            LearningSession.ended_at.is_not(None),
        )
        .order_by(LearningSession.ended_at.desc())
        .limit(1)
    ).first()
    if row is None:
        return "Licao atual", "Unidade atual"
    return str(row[0] or "Licao atual"), str(row[1] or "Unidade atual")


def _due_reviews_count(db: Session, *, user_id: int) -> int:
    now = datetime.now(UTC)
    value = db.scalar(
        select(func.count(UserSkillMastery.id)).where(
            UserSkillMastery.user_id == user_id,
            UserSkillMastery.next_review_at.is_not(None),
            UserSkillMastery.next_review_at <= now,
        )
    )
    return int(value or 0)


def _xp_coins_delta(db: Session, *, user_id: int) -> tuple[int, int]:
    now = datetime.now(UTC)
    start = now - timedelta(days=7)
    xp_learning = int(
        db.scalar(
            select(func.coalesce(func.sum(LearningSession.xp_earned), 0)).where(
                LearningSession.user_id == user_id,
                LearningSession.ended_at.is_not(None),
                LearningSession.ended_at >= start,
            )
        )
        or 0
    )
    coins_learning = int(
        db.scalar(
            select(func.coalesce(func.sum(LearningSession.coins_earned), 0)).where(
                LearningSession.user_id == user_id,
                LearningSession.ended_at.is_not(None),
                LearningSession.ended_at >= start,
            )
        )
        or 0
    )
    profile = db.scalar(select(UserGameProfile).where(UserGameProfile.user_id == user_id))
    return xp_learning, coins_learning + int(profile.axion_coins if profile is not None else 0)


def _build_facts(db: Session, *, user_id: int, provided: dict[str, Any] | None = None) -> dict[str, Any]:
    facts_snapshot = build_axion_facts(db, user_id=user_id)
    weak_skill = facts_snapshot.weakest_skills[0].name if facts_snapshot.weakest_skills else "este tema"
    strong_skill = facts_snapshot.strongest_skills[0].name if facts_snapshot.strongest_skills else "seu ponto forte"
    lesson_name = facts_snapshot.last_lesson.lesson_title if facts_snapshot.last_lesson is not None else "Licao atual"
    unit_name = facts_snapshot.last_lesson.unit_title if facts_snapshot.last_lesson is not None else "Unidade atual"
    streak = int(facts_snapshot.streak_days)
    due_reviews = int(facts_snapshot.due_reviews_count)
    user = db.get(User, user_id)
    facts = {
        "name": str(user.name if user is not None else "campeao"),
        "skill": weak_skill,
        "weakSkill": weak_skill,
        "strongSkill": strong_skill,
        "unit": unit_name,
        "lesson": lesson_name,
        "streak": streak,
        "coins": int(facts_snapshot.wallet.total),
        "xp": int(max(0.0, facts_snapshot.weekly_completion_rate * 100)),
        "dueReviews": due_reviews,
        "dueReviewsCount": due_reviews,
        "stars": int(facts_snapshot.last_lesson.stars if facts_snapshot.last_lesson is not None else 0),
        "energy": int(facts_snapshot.energy.current),
    }
    if provided:
        facts.update(provided)
    return facts


def _render_with_placeholders(raw_text: str, facts: dict[str, Any]) -> str:
    def repl(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        return str(facts.get(key, ""))

    return _PLACEHOLDER_PATTERN.sub(repl, raw_text)


def _apply_synonyms(text_value: str, *, seed: int) -> str:
    updated = text_value
    for base, options in _SYNONYMS.items():
        if base not in updated.lower():
            continue
        pick = options[seed % len(options)]
        updated = re.sub(base, pick, updated, flags=re.IGNORECASE)
    return updated


def _shuffle_sentences(text_value: str, *, seed: int) -> str:
    parts = [item.strip() for item in re.split(r"(?<=[.!?])\s+", text_value) if item.strip()]
    if len(parts) < 2:
        return text_value
    shift = seed % len(parts)
    rotated = parts[shift:] + parts[:shift]
    return " ".join(rotated)


def _pick_variant(template_text: str, *, seed: int) -> str:
    variants = [item.strip() for item in template_text.split("||") if item.strip()]
    if not variants:
        return template_text
    return variants[seed % len(variants)]


def _state_to_dict(state: Any | None) -> dict[str, Any]:
    if state is None:
        return {}
    if isinstance(state, AxionUserState):
        return {
            "rhythmScore": float(state.rhythm_score),
            "frustrationScore": float(state.frustration_score),
            "confidenceScore": float(state.confidence_score),
            "dropoutRiskScore": float(state.dropout_risk_score),
            "learningMomentum": float(state.learning_momentum),
        }
    if hasattr(state, "rhythm_score"):
        return {
            "rhythmScore": float(getattr(state, "rhythm_score", 0.0)),
            "frustrationScore": float(getattr(state, "frustration_score", 0.0)),
            "confidenceScore": float(getattr(state, "confidence_score", 0.0)),
            "dropoutRiskScore": float(getattr(state, "dropout_risk_score", 0.0)),
            "learningMomentum": float(getattr(state, "learning_momentum", 0.0)),
        }
    return {}


def generate_axion_message(
    db: Session,
    *,
    user_id: int,
    context: str,
    state: Any | None = None,
    recent_facts: dict[str, Any] | None = None,
    record_history: bool = True,
) -> AxionMessageSnapshot:
    normalized_context = _normalize_context(context)
    state_row = state
    if state_row is None:
        state_row = db.scalar(select(AxionUserState).where(AxionUserState.user_id == user_id))
    if state_row is None:
        state_row = compute_axion_state(db, user_id=user_id)
    state_dict = _state_to_dict(state_row)
    persona = resolve_user_persona(db, user_id=user_id, state=state_row, auto_switch=True).persona
    facts = _build_facts(db, user_id=user_id, provided=recent_facts)

    templates = db.scalars(
        select(AxionMessageTemplate).where(
            AxionMessageTemplate.enabled.is_(True),
            AxionMessageTemplate.context.in_([normalized_context, "any"]),
        )
    ).all()
    if not templates:
        raise ValueError("No enabled Axion message templates found")

    eligible = [item for item in templates if _matches_conditions(item, state_dict=state_dict, facts=facts)]
    if not eligible:
        eligible = templates

    recent_ids = set(_recent_template_ids(db, user_id=user_id, limit=5))
    non_repeated = [item for item in eligible if item.id not in recent_ids]
    candidates = non_repeated if non_repeated else eligible

    persona_key = str(persona.message_style_key).strip().lower()
    persona_name_key = str(persona.name).strip().lower().replace(" ", "_")
    persona_filtered = [
        item
        for item in candidates
        if any(tag.strip().lower() in {persona_key, persona_name_key} for tag in item.tags or [])
    ]
    if persona_filtered:
        candidates = persona_filtered

    tone_priority = {tone: idx for idx, tone in enumerate(_tone_order(state_row, tone_bias=str(persona.tone_bias).upper()))}
    candidates.sort(key=lambda item: (tone_priority.get(item.tone, 99), item.id))

    seed = _seed_int(str(user_id), normalized_context, datetime.now(UTC).strftime("%Y%m%d%H"))
    selected = _weighted_pick(candidates, seed=seed)
    variant_text = _pick_variant(selected.message_text, seed=seed + selected.id)
    rendered = _render_with_placeholders(variant_text, facts)
    rendered = _shuffle_sentences(rendered, seed=seed + 7)
    rendered = _apply_synonyms(rendered, seed=seed + 13)
    rendered = _safe_message(rendered)

    if record_history:
        db.add(
            AxionMessageHistory(
                user_id=user_id,
                template_id=selected.id,
                context=normalized_context,
            )
        )
        db.flush()
    return AxionMessageSnapshot(
        template_id=selected.id,
        tone=selected.tone.value,
        message=rendered,
    )


def generateAxionMessage(
    db: Session,
    userId: int,
    context: str,
    state: Any | None = None,
    recentFacts: dict[str, Any] | None = None,
    recordHistory: bool = True,
) -> dict[str, str | int]:
    snapshot = generate_axion_message(
        db,
        user_id=userId,
        context=context,
        state=state,
        recent_facts=recentFacts,
        record_history=recordHistory,
    )
    return {
        "message": snapshot.message,
        "tone": snapshot.tone,
        "templateId": snapshot.template_id,
    }
