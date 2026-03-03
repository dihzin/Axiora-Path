from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AxionContentCatalog, ChildContentHistory, ChildSubjectMastery, ContentPrerequisite, EventLog
from app.observability.axion_metrics import safe_increment_prereq_unlock_total


def _list_prerequisites(db: Session, *, content_id: int) -> list[int]:
    if not hasattr(db, "scalars"):
        return []
    rows = db.scalars(
        select(ContentPrerequisite.prerequisite_content_id).where(
            ContentPrerequisite.content_id == int(content_id)
        )
    ).all()
    return [int(item) for item in rows]


def _has_served_content(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    content_id: int,
) -> bool:
    if not hasattr(db, "scalar"):
        return False
    row_id = db.scalar(
        select(ChildContentHistory.id)
        .where(
            ChildContentHistory.tenant_id == int(tenant_id),
            ChildContentHistory.child_id == int(child_id),
            ChildContentHistory.content_id == int(content_id),
        )
        .limit(1)
    )
    return row_id is not None


def _subject_mastery_for_content(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    content_id: int,
) -> float | None:
    if not hasattr(db, "scalar"):
        return None
    subject = db.scalar(
        select(AxionContentCatalog.subject).where(
            AxionContentCatalog.content_id == int(content_id),
        )
    )
    normalized_subject = str(subject or "").strip().lower()
    if not normalized_subject:
        return None
    score = db.scalar(
        select(ChildSubjectMastery.mastery_score).where(
            ChildSubjectMastery.tenant_id == int(tenant_id),
            ChildSubjectMastery.child_id == int(child_id),
            ChildSubjectMastery.subject == normalized_subject,
        )
    )
    if score is None:
        return None
    return float(score)


def can_serve_content(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    content_id: int,
    mastery_threshold: float | None = None,
) -> bool:
    threshold = float(settings.axion_prerequisite_mastery_threshold if mastery_threshold is None else mastery_threshold)
    prerequisites = _list_prerequisites(db, content_id=content_id)
    if len(prerequisites) == 0:
        return True
    for prerequisite_content_id in prerequisites:
        served = _has_served_content(
            db,
            tenant_id=tenant_id,
            child_id=child_id,
            content_id=prerequisite_content_id,
        )
        if not served:
            return False
        mastery = _subject_mastery_for_content(
            db,
            tenant_id=tenant_id,
            child_id=child_id,
            content_id=prerequisite_content_id,
        )
        if mastery is None or mastery < threshold:
            return False
    return True


def filter_candidates_by_prerequisites(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    candidate_content_ids: list[int],
    mastery_threshold: float | None = None,
) -> list[int]:
    allowed: list[int] = []
    for content_id in candidate_content_ids:
        cid = int(content_id)
        eligible = can_serve_content(
            db,
            tenant_id=tenant_id,
            child_id=child_id,
            content_id=cid,
            mastery_threshold=mastery_threshold,
        )
        _track_prereq_unlock_transition(
            db,
            tenant_id=tenant_id,
            child_id=child_id,
            content_id=cid,
            eligible=eligible,
        )
        if eligible:
            allowed.append(cid)
    return allowed


def _latest_prereq_eligibility_state(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    content_id: int,
) -> bool | None:
    if not hasattr(db, "scalar"):
        return None
    value = db.scalar(
        select(EventLog.payload["eligible"].astext)
        .where(
            EventLog.tenant_id == int(tenant_id),
            EventLog.child_id == int(child_id),
            EventLog.type == "axion_prereq_eligibility_state",
            EventLog.payload["content_id"].astext == str(int(content_id)),
        )
        .order_by(EventLog.created_at.desc(), EventLog.id.desc())
        .limit(1)
    )
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in {"true", "1"}:
        return True
    if text in {"false", "0"}:
        return False
    return None


def _record_prereq_eligibility_state(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    content_id: int,
    eligible: bool,
) -> None:
    if not hasattr(db, "add"):
        return
    db.add(
        EventLog(
            tenant_id=int(tenant_id),
            actor_user_id=None,
            child_id=int(child_id),
            type="axion_prereq_eligibility_state",
            payload={
                "content_id": int(content_id),
                "eligible": bool(eligible),
            },
        )
    )


def _record_prereq_unlocked(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    content_id: int,
) -> None:
    if not hasattr(db, "add"):
        return
    db.add(
        EventLog(
            tenant_id=int(tenant_id),
            actor_user_id=None,
            child_id=int(child_id),
            type="axion_prereq_unlocked",
            payload={"content_id": int(content_id)},
        )
    )


def _track_prereq_unlock_transition(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    content_id: int,
    eligible: bool,
) -> None:
    previous = _latest_prereq_eligibility_state(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        content_id=content_id,
    )
    if previous is False and bool(eligible):
        safe_increment_prereq_unlock_total()
        _record_prereq_unlocked(
            db,
            tenant_id=tenant_id,
            child_id=child_id,
            content_id=content_id,
        )
    _record_prereq_eligibility_state(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        content_id=content_id,
        eligible=eligible,
    )
