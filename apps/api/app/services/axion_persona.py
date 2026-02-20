from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AxionMessageTone, AxionPersona, UserPersonaState

DEFAULT_PERSONAS: list[dict[str, object]] = [
    {
        "name": "Mentor",
        "tone_bias": AxionMessageTone.SUPPORT.value,
        "reward_bias": Decimal("1.05"),
        "challenge_bias": Decimal("0.90"),
        "message_style_key": "mentor",
    },
    {
        "name": "Strategist",
        "tone_bias": AxionMessageTone.CHALLENGE.value,
        "reward_bias": Decimal("0.95"),
        "challenge_bias": Decimal("1.10"),
        "message_style_key": "strategist",
    },
    {
        "name": "Explorer",
        "tone_bias": AxionMessageTone.ENCOURAGE.value,
        "reward_bias": Decimal("1.00"),
        "challenge_bias": Decimal("1.00"),
        "message_style_key": "explorer",
    },
    {
        "name": "Calm Guide",
        "tone_bias": AxionMessageTone.CALM.value,
        "reward_bias": Decimal("1.00"),
        "challenge_bias": Decimal("0.85"),
        "message_style_key": "calm_guide",
    },
    {
        "name": "Challenger",
        "tone_bias": AxionMessageTone.CHALLENGE.value,
        "reward_bias": Decimal("0.90"),
        "challenge_bias": Decimal("1.20"),
        "message_style_key": "challenger",
    },
]


@dataclass(slots=True)
class PersonaResolution:
    persona: AxionPersona
    switched: bool
    reason: str | None


def ensure_default_personas(db: Session) -> dict[str, AxionPersona]:
    rows = db.scalars(select(AxionPersona)).all()
    by_name = {row.name: row for row in rows}
    changed = False
    for item in DEFAULT_PERSONAS:
        name = str(item["name"])
        if name in by_name:
            continue
        row = AxionPersona(
            name=name,
            tone_bias=str(item["tone_bias"]),
            reward_bias=item["reward_bias"],  # type: ignore[arg-type]
            challenge_bias=item["challenge_bias"],  # type: ignore[arg-type]
            message_style_key=str(item["message_style_key"]),
        )
        db.add(row)
        db.flush()
        by_name[name] = row
        changed = True
    if changed:
        db.flush()
    return by_name


def _state_value(state: object, key: str) -> float:
    if hasattr(state, key):
        return float(getattr(state, key))
    if hasattr(state, "debug") and isinstance(getattr(state, "debug"), dict):
        debug = getattr(state, "debug")
        if key in debug:
            return float(debug[key])
    return 0.0


def _target_persona_name(state: object) -> tuple[str | None, str | None]:
    frustration = _state_value(state, "frustration_score")
    confidence = _state_value(state, "confidence_score")
    dropout = _state_value(state, "dropout_risk_score")
    dropout_delta = 0.0
    if hasattr(state, "debug") and isinstance(getattr(state, "debug"), dict):
        dropout_delta = float(getattr(state, "debug").get("dropoutRiskDelta", 0.0))

    if frustration >= 0.70:
        return "Calm Guide", "high_frustration"
    if confidence >= 0.80 and dropout < 0.55:
        return "Challenger", "high_confidence"
    if dropout >= 0.65 or dropout_delta >= 0.05:
        return "Mentor", "dropout_risk_rising"
    return None, None


def get_or_create_user_persona_state(db: Session, *, user_id: int) -> UserPersonaState:
    state = db.get(UserPersonaState, user_id)
    if state is not None:
        return state
    personas = ensure_default_personas(db)
    default_persona = personas.get("Explorer") or next(iter(personas.values()))
    state = UserPersonaState(
        user_id=user_id,
        active_persona_id=default_persona.id,
        auto_switch_enabled=True,
        last_switch_at=datetime.now(UTC),
    )
    db.add(state)
    db.flush()
    return state


def resolve_user_persona(
    db: Session,
    *,
    user_id: int,
    state: object | None = None,
    auto_switch: bool = True,
) -> PersonaResolution:
    personas = ensure_default_personas(db)
    persona_state = get_or_create_user_persona_state(db, user_id=user_id)
    active = db.get(AxionPersona, persona_state.active_persona_id)
    if active is None:
        active = personas.get("Explorer") or next(iter(personas.values()))
        persona_state.active_persona_id = active.id
        persona_state.last_switch_at = datetime.now(UTC)
        db.flush()

    if not auto_switch or not persona_state.auto_switch_enabled or state is None:
        return PersonaResolution(persona=active, switched=False, reason=None)

    target_name, reason = _target_persona_name(state)
    if not target_name or target_name == active.name:
        return PersonaResolution(persona=active, switched=False, reason=None)

    target = personas.get(target_name)
    if target is None:
        return PersonaResolution(persona=active, switched=False, reason=None)

    now = datetime.now(UTC)
    if persona_state.last_switch_at and (now - persona_state.last_switch_at) < timedelta(minutes=30):
        return PersonaResolution(persona=active, switched=False, reason=None)

    persona_state.active_persona_id = target.id
    persona_state.last_switch_at = now
    db.flush()
    return PersonaResolution(persona=target, switched=True, reason=reason)

