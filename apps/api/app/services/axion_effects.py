from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import QuestionDifficulty, TemporaryBoostType, UserTemporaryBoost


def cleanup_expired_temporary_boosts(db: Session, *, user_id: int | None = None) -> int:
    now = datetime.now(UTC)
    stmt = delete(UserTemporaryBoost).where(UserTemporaryBoost.expires_at <= now)
    if user_id is not None:
        stmt = stmt.where(UserTemporaryBoost.user_id == user_id)
    result = db.execute(stmt)
    return int(result.rowcount or 0)


def upsert_temporary_boost(
    db: Session,
    *,
    user_id: int,
    boost_type: TemporaryBoostType,
    value: dict[str, Any],
    ttl_minutes: int,
) -> UserTemporaryBoost:
    cleanup_expired_temporary_boosts(db, user_id=user_id)
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=max(1, int(ttl_minutes)))
    row = db.scalar(
        select(UserTemporaryBoost).where(
            UserTemporaryBoost.user_id == user_id,
            UserTemporaryBoost.type == boost_type,
        )
    )
    if row is None:
        row = UserTemporaryBoost(
            user_id=user_id,
            type=boost_type,
            value=value,
            expires_at=expires_at,
        )
        db.add(row)
        db.flush()
        return row
    current_value = row.value if isinstance(row.value, dict) else {}
    merged = {**current_value, **value}
    row.value = merged
    row.expires_at = max(row.expires_at, expires_at)
    db.flush()
    return row


def get_active_temporary_boosts(db: Session, *, user_id: int) -> dict[TemporaryBoostType, UserTemporaryBoost]:
    cleanup_expired_temporary_boosts(db, user_id=user_id)
    rows = db.scalars(
        select(UserTemporaryBoost).where(
            UserTemporaryBoost.user_id == user_id,
        )
    ).all()
    by_type: dict[TemporaryBoostType, UserTemporaryBoost] = {}
    for row in rows:
        existing = by_type.get(row.type)
        if existing is None or row.expires_at > existing.expires_at:
            by_type[row.type] = row
    return by_type


def get_xp_multiplier_boost(db: Session, *, user_id: int) -> float:
    boosts = get_active_temporary_boosts(db, user_id=user_id)
    row = boosts.get(TemporaryBoostType.XP_MULTIPLIER)
    if row is None or not isinstance(row.value, dict):
        return 1.0
    return max(1.0, float(row.value.get("multiplier", 1.0)))


def get_energy_discount_multiplier(db: Session, *, user_id: int) -> float:
    boosts = get_active_temporary_boosts(db, user_id=user_id)
    row = boosts.get(TemporaryBoostType.ENERGY_DISCOUNT)
    if row is None or not isinstance(row.value, dict):
        return 1.0
    value = float(row.value.get("multiplier", 1.0))
    return min(1.0, max(0.0, value))


def get_difficulty_cap_boost(
    db: Session,
    *,
    user_id: int,
) -> tuple[QuestionDifficulty | None, dict[str, float], bool]:
    boosts = get_active_temporary_boosts(db, user_id=user_id)
    row = boosts.get(TemporaryBoostType.DIFFICULTY_CAP)
    if row is None or not isinstance(row.value, dict):
        return None, {"easyRatioBoost": 0.0, "hardRatioBoost": 0.0}, False
    cap_raw = str(row.value.get("cap", "")).upper()
    cap = QuestionDifficulty[cap_raw] if cap_raw in QuestionDifficulty.__members__ else None
    easy_boost = float(row.value.get("easyRatioBoost", 0.0))
    hard_boost = float(row.value.get("hardRatioBoost", 0.0))
    trigger_review = bool(row.value.get("triggerReview", False))
    return cap, {"easyRatioBoost": easy_boost, "hardRatioBoost": hard_boost}, trigger_review


def apply_actions_to_temporary_boosts(
    db: Session,
    *,
    user_id: int,
    actions: list[dict[str, Any]],
) -> None:
    for action in actions:
        action_type = str(action.get("type", "")).strip().upper()
        params = action.get("params", {}) if isinstance(action.get("params"), dict) else {}
        if action_type == "ADJUST_DIFFICULTY":
            mode = str(params.get("mode", "auto")).lower()
            cap = params.get("difficultyCap")
            if cap is None and mode == "down":
                cap = "MEDIUM"
            payload = {
                "cap": str(cap).upper() if cap else "",
                "easyRatioBoost": float(params.get("easyRatioBoost", 0.0)),
                "hardRatioBoost": float(params.get("hardRatioBoost", 0.0)),
                "triggerReview": bool(params.get("triggerReview", False)),
            }
            upsert_temporary_boost(
                db,
                user_id=user_id,
                boost_type=TemporaryBoostType.DIFFICULTY_CAP,
                value=payload,
                ttl_minutes=int(params.get("ttlMinutes", 90)),
            )
        elif action_type == "TRIGGER_REVIEW":
            upsert_temporary_boost(
                db,
                user_id=user_id,
                boost_type=TemporaryBoostType.DIFFICULTY_CAP,
                value={"triggerReview": True},
                ttl_minutes=int(params.get("ttlMinutes", 90)),
            )
        elif action_type == "REDUCE_ENERGY_COST":
            raw_value = float(params.get("value", params.get("multiplier", 0.5)))
            upsert_temporary_boost(
                db,
                user_id=user_id,
                boost_type=TemporaryBoostType.ENERGY_DISCOUNT,
                value={"multiplier": min(1.0, max(0.0, raw_value))},
                ttl_minutes=int(params.get("ttlMinutes", 60)),
            )
        elif action_type == "OFFER_BOOST":
            raw_value = float(params.get("value", params.get("xpMultiplier", 1.2)))
            ttl = int(params.get("ttlMinutes", params.get("durationHours", 24) * 60))
            upsert_temporary_boost(
                db,
                user_id=user_id,
                boost_type=TemporaryBoostType.XP_MULTIPLIER,
                value={"multiplier": max(1.0, raw_value)},
                ttl_minutes=ttl,
            )
