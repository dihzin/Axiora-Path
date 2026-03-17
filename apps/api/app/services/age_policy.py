"""
age_policy.py — Canonical age-gating module for Axiora learning.

Single source of truth for:
- Subject age eligibility checks
- Subject remapping by child age
- Age-group-based difficulty rules

All routes and services MUST import from here instead of duplicating logic.

Breaking change introduced in Wave 1 refactor (2026-03-16):
  - _ensure_subject_allowed_for_child_age in learning.py → removed
  - _remap_subject_id_for_child_age in learning.py → removed
  - Inline age guard in aprender.py → removed
  - Unified Portuguese error message across all enforcement points
"""

from __future__ import annotations

import logging
from datetime import date
from typing import TYPE_CHECKING

from fastapi import HTTPException, status
from sqlalchemy import func, select

from app.models import ChildProfile, LessonDifficulty, Subject, SubjectAgeGroup
from app.services.child_age import get_child_age

if TYPE_CHECKING:
    from app.db.session import DBSession

logger = logging.getLogger("axiora.age_policy")

# ─── Canonical error contract ────────────────────────────────────────────────

AGE_GATE_ERROR_CODE = "CONTENT_AGE_RESTRICTED"
AGE_GATE_MESSAGE = "Este conteúdo não está disponível para a sua faixa etária."

# Age group → (min_age, max_age) - mirrors Subject.age_min/age_max hybrid props.
AGE_GROUP_BOUNDS: dict[SubjectAgeGroup, tuple[int, int]] = {
    SubjectAgeGroup.AGE_6_8: (6, 8),
    SubjectAgeGroup.AGE_9_12: (9, 12),
    SubjectAgeGroup.AGE_13_15: (13, 15),
}

# ─── Core age resolution ──────────────────────────────────────────────────────


def resolve_child_age(db: "DBSession", *, user_id: int, tenant_id: int) -> int | None:
    """Return child age in years, or None if no child profile is linked to this user.

    Queries ChildProfile directly by user_id — NOT by tenant_id — so that in
    multi-child tenants the correct child's profile is always used.

    Returns None for parent/teacher actors (no ChildProfile.user_id == user_id).
    """
    child = db.scalar(
        select(ChildProfile)
        .where(
            ChildProfile.user_id == user_id,
            ChildProfile.deleted_at.is_(None),
        )
        .limit(1)
    )
    if child is None or child.date_of_birth is None:
        logger.debug(
            "age_policy.resolve_child_age.no_profile",
            extra={"user_id": user_id, "tenant_id": tenant_id},
        )
        return None
    age = get_child_age(child.date_of_birth, today=date.today())
    logger.debug(
        "age_policy.resolve_child_age.resolved",
        extra={"user_id": user_id, "child_id": child.id, "child_age": age},
    )
    return age


def resolve_child_age_by_child_id(db: "DBSession", *, child_id: int) -> int | None:
    """Return child age in years given explicit child_id."""
    child = db.get(ChildProfile, int(child_id))
    if child is None or child.date_of_birth is None:
        return None
    return get_child_age(child.date_of_birth, today=date.today())


def age_group_from_age(age: int) -> SubjectAgeGroup:
    """Map a numeric age to canonical SubjectAgeGroup."""
    if age <= 8:
        return SubjectAgeGroup.AGE_6_8
    if age <= 12:
        return SubjectAgeGroup.AGE_9_12
    return SubjectAgeGroup.AGE_13_15


# ─── Enforcement ─────────────────────────────────────────────────────────────


def enforce_subject_age_gate(
    db: "DBSession",
    *,
    tenant_id: int,
    user_id: int,
    subject_id: int,
) -> None:
    """
    Raise HTTP 403 with canonical message if the child is outside the subject's
    age window. No-ops when no child profile is linked (parent/teacher actors).

    Replaces:
      - learning.py::_ensure_subject_allowed_for_child_age  (Portuguese 403)
      - aprender.py inline age_group check                  (English 403 - now unified)
    """
    child_age = resolve_child_age(db, user_id=user_id, tenant_id=tenant_id)
    if child_age is None:
        logger.debug(
            "age_policy.enforce.skipped_non_child",
            extra={"user_id": user_id, "subject_id": subject_id},
        )
        return  # non-child actor; no restriction

    subject = db.get(Subject, int(subject_id))
    if subject is None:
        logger.debug(
            "age_policy.enforce.subject_not_found",
            extra={"user_id": user_id, "subject_id": subject_id},
        )
        return  # subject not found; let route handle 404

    allowed = int(subject.age_min) <= int(child_age) <= int(subject.age_max)
    logger.info(
        "age_policy.enforce.result",
        extra={
            "user_id": user_id,
            "subject_id": subject_id,
            "child_age": child_age,
            "age_min": subject.age_min,
            "age_max": subject.age_max,
            "allowed": allowed,
        },
    )

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": AGE_GATE_ERROR_CODE,
                "message": AGE_GATE_MESSAGE,
            },
        )


def remap_subject_for_child_age(
    db: "DBSession",
    *,
    tenant_id: int,
    user_id: int,
    requested_subject_id: int,
) -> int | None:
    """
    If the requested subject does not match the child's age range, attempt to
    find a same-name subject that does. Returns:
      - requested_subject_id   if already age-appropriate (or no child profile)
      - remapped_subject_id    if a matching same-name subject exists
      - None                   if no same-name subject exists for this age

    Replaces: learning.py::_remap_subject_id_for_child_age
    """
    child_age = resolve_child_age(db, user_id=user_id, tenant_id=tenant_id)
    if child_age is None:
        return requested_subject_id

    requested_subject = db.get(Subject, int(requested_subject_id))
    if requested_subject is None:
        return requested_subject_id

    # Already within age bounds → no remap needed
    if int(requested_subject.age_min) <= int(child_age) <= int(requested_subject.age_max):
        return requested_subject_id

    # Try to find same-name subject for this child's age
    matched = db.scalar(
        select(Subject.id)
        .where(
            func.lower(Subject.name) == str(requested_subject.name).strip().lower(),
            Subject.age_min <= int(child_age),
            Subject.age_max >= int(child_age),
        )
        .order_by(Subject.order.asc(), Subject.id.asc())
        .limit(1)
    )
    if matched is None:
        return None
    return int(matched)


# ─── Difficulty × age-group policy ───────────────────────────────────────────


def is_difficulty_allowed_for_age(
    *,
    difficulty: LessonDifficulty,
    age_group: SubjectAgeGroup,
) -> bool:
    """
    Returns True if the given difficulty is appropriate for the age group.

    Rule table:
      AGE_6_8   → EASY only
      AGE_9_12  → EASY | MEDIUM
      AGE_13_15 → all difficulties

    Replaces: aprender.py service::is_difficulty_allowed_for_age_group
    Note: kept as a thin delegate here; aprender.service still exports it for
    backward compat but will call this function going forward.
    """
    if age_group == SubjectAgeGroup.AGE_6_8:
        return difficulty == LessonDifficulty.EASY
    if age_group == SubjectAgeGroup.AGE_9_12:
        return difficulty in (LessonDifficulty.EASY, LessonDifficulty.MEDIUM)
    return True  # AGE_13_15 allows all


# ─── Subject list filtering ───────────────────────────────────────────────────


def subject_age_filter_clauses(child_age: int):
    """
    Return SQLAlchemy WHERE clauses restricting Subject rows to those whose
    age_min/age_max window includes child_age.

    Usage:
        stmt = select(Subject).where(*subject_age_filter_clauses(child_age))
    """
    return (
        Subject.age_min <= int(child_age),
        Subject.age_max >= int(child_age),
    )
