from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import AxionContentCatalog, AxionDecision, ChildSubjectMastery


def _normalize_subject(value: str | None) -> str | None:
    token = str(value or "").strip().lower()
    return token or None


def _load_last_decision(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    user_id: int,
) -> AxionDecision | None:
    if not hasattr(db, "scalar"):
        return None
    return db.scalar(
        select(AxionDecision)
        .where(
            AxionDecision.tenant_id == int(tenant_id),
            AxionDecision.child_id == int(child_id),
            AxionDecision.user_id == int(user_id),
        )
        .order_by(AxionDecision.decided_at.desc(), AxionDecision.created_at.desc())
        .limit(1)
    )


def _resolve_decision_subject(db: Session, *, decision: AxionDecision) -> str | None:
    metadata = dict(getattr(decision, "metadata_json", {}) or {})
    from_metadata = _normalize_subject(metadata.get("selected_subject"))
    if from_metadata:
        return from_metadata

    selected_content_id = metadata.get("selected_content_id")
    if selected_content_id is None or not hasattr(db, "scalar"):
        return None
    try:
        content_id = int(selected_content_id)
    except (TypeError, ValueError):
        return None
    subject = db.scalar(
        select(func.lower(AxionContentCatalog.subject)).where(
            AxionContentCatalog.content_id == content_id,
        )
    )
    return _normalize_subject(str(subject) if subject is not None else None)


def _load_baseline_mastery_before_decision(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    subject: str,
    decided_at: datetime,
    decision: AxionDecision,
) -> float | None:
    metadata = dict(getattr(decision, "metadata_json", {}) or {})
    raw_start = metadata.get("mastery_at_session_start")
    if raw_start is not None:
        try:
            return float(raw_start)
        except (TypeError, ValueError):
            return None

    if not hasattr(db, "execute"):
        return None
    row = (
        db.execute(
            text(
                """
                SELECT
                    NULLIF(e.payload->>'mastery_score', '')::numeric AS mastery_score
                FROM event_log e
                WHERE e.tenant_id = :tenant_id
                  AND e.child_id = :child_id
                  AND e.type = 'axion_subject_mastery_outcome'
                  AND LOWER(COALESCE(e.payload->>'subject', '')) = :subject
                  AND e.created_at <= :decided_at
                ORDER BY e.created_at DESC
                LIMIT 1
                """
            ),
            {
                "tenant_id": int(tenant_id),
                "child_id": int(child_id),
                "subject": str(subject).strip().lower(),
                "decided_at": decided_at,
            },
        )
        .mappings()
        .first()
    )
    if not row:
        return None
    try:
        return float(row["mastery_score"])
    except (TypeError, ValueError, KeyError):
        return None


def _load_current_mastery(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    subject: str,
) -> float | None:
    if not hasattr(db, "scalar"):
        return None
    current = db.scalar(
        select(ChildSubjectMastery.mastery_score).where(
            ChildSubjectMastery.tenant_id == int(tenant_id),
            ChildSubjectMastery.child_id == int(child_id),
            ChildSubjectMastery.subject == str(subject).strip().lower(),
        )
    )
    if current is None:
        return None
    try:
        return float(current)
    except (TypeError, ValueError):
        return None


def get_session_delta(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    user_id: int,
) -> dict[str, Any]:
    decision = _load_last_decision(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        user_id=user_id,
    )
    if decision is None:
        return {"subject": None, "delta_mastery": None}

    subject = _resolve_decision_subject(db, decision=decision)
    if not subject:
        return {"subject": None, "delta_mastery": None}

    baseline = _load_baseline_mastery_before_decision(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        subject=subject,
        decided_at=decision.decided_at,
        decision=decision,
    )
    current = _load_current_mastery(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        subject=subject,
    )
    if baseline is None or current is None:
        return {"subject": subject, "delta_mastery": None}
    return {
        "subject": subject,
        "delta_mastery": round(float(current) - float(baseline), 4),
    }
