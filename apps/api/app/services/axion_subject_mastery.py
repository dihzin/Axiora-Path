from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ChildSubjectMastery, EventLog
from app.observability.axion_metrics import safe_increment_mastery_updates_total, safe_observe_mastery_score

_OUTCOME_CORRECT = "correct"
_OUTCOME_INCORRECT = "incorrect"
_OUTCOME_SKIPPED = "skipped"


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _normalize_subject(subject: str) -> str:
    return str(subject or "").strip().lower()


def _normalize_correlation_id(correlation_id: str | None) -> str | None:
    token = str(correlation_id or "").strip()
    if not token:
        return None
    try:
        return str(UUID(token))
    except Exception:
        return token


def _next_mastery_score(current: float, *, outcome: str, alpha: float, beta: float) -> float:
    normalized = str(outcome or "").strip().lower()
    if normalized == _OUTCOME_CORRECT:
        return _clamp(float(current) + float(alpha))
    if normalized == _OUTCOME_INCORRECT:
        return _clamp(float(current) - float(beta))
    return _clamp(float(current))


def _get_subject_mastery_row(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    subject: str,
) -> ChildSubjectMastery | None:
    if not hasattr(db, "scalar"):
        return None
    return db.scalar(
        select(ChildSubjectMastery).where(
            ChildSubjectMastery.tenant_id == int(tenant_id),
            ChildSubjectMastery.child_id == int(child_id),
            ChildSubjectMastery.subject == _normalize_subject(subject),
        )
    )


def update_child_subject_mastery(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    subject: str,
    outcome: str,
    alpha: float | None = None,
    beta: float | None = None,
) -> float:
    normalized_subject = _normalize_subject(subject)
    if not normalized_subject:
        return 0.0

    a = float(settings.axion_subject_mastery_alpha if alpha is None else alpha)
    b = float(settings.axion_subject_mastery_beta if beta is None else beta)
    row = _get_subject_mastery_row(
        db,
        tenant_id=int(tenant_id),
        child_id=int(child_id),
        subject=normalized_subject,
    )
    if row is None:
        row = ChildSubjectMastery(
            tenant_id=int(tenant_id),
            child_id=int(child_id),
            subject=normalized_subject,
            mastery_score=0,
            updated_at=datetime.now(UTC),
        )
        if hasattr(db, "add"):
            db.add(row)
    current = float(getattr(row, "mastery_score", 0.0) or 0.0)
    row.mastery_score = _next_mastery_score(current, outcome=outcome, alpha=a, beta=b)
    row.updated_at = datetime.now(UTC)
    return float(row.mastery_score)


def _outcome_already_recorded(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    subject: str,
    correlation_id: str,
) -> bool:
    if not hasattr(db, "scalar"):
        return False
    found = db.scalar(
        select(EventLog.id).where(
            EventLog.tenant_id == int(tenant_id),
            EventLog.child_id == int(child_id),
            EventLog.type == "axion_subject_mastery_outcome",
            EventLog.payload["correlation_id"].astext == str(correlation_id),
            EventLog.payload["subject"].astext == _normalize_subject(subject),
        )
    )
    return found is not None


def _mark_outcome_recorded(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    subject: str,
    outcome: str,
    correlation_id: str | None,
    mastery_score: float,
) -> None:
    if not hasattr(db, "add"):
        return
    db.add(
        EventLog(
            tenant_id=int(tenant_id),
            actor_user_id=None,
            child_id=int(child_id),
            type="axion_subject_mastery_outcome",
            payload={
                "correlation_id": correlation_id,
                "subject": _normalize_subject(subject),
                "outcome": str(outcome or "").strip().lower(),
                "mastery_score": round(float(mastery_score), 6),
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )
    )


def record_content_outcome(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    subject: str,
    outcome: str,
    correlation_id: str | None = None,
) -> float | None:
    normalized_subject = _normalize_subject(subject)
    if not normalized_subject:
        return None

    normalized_correlation_id = _normalize_correlation_id(correlation_id)
    if normalized_correlation_id and _outcome_already_recorded(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        subject=normalized_subject,
        correlation_id=normalized_correlation_id,
    ):
        existing = _get_subject_mastery_row(
            db,
            tenant_id=tenant_id,
            child_id=child_id,
            subject=normalized_subject,
        )
        return float(existing.mastery_score) if existing is not None else None

    new_mastery = update_child_subject_mastery(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        subject=normalized_subject,
        outcome=str(outcome or "").strip().lower(),
    )
    safe_increment_mastery_updates_total(normalized_subject)
    safe_observe_mastery_score(normalized_subject, float(new_mastery))
    _mark_outcome_recorded(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        subject=normalized_subject,
        outcome=outcome,
        correlation_id=normalized_correlation_id,
        mastery_score=new_mastery,
    )
    return new_mastery
