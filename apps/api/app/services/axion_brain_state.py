from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AxionContentCatalog, ChildContentHistory, ChildSubjectMastery


def _round4(value: float) -> float:
    return round(float(value), 4)


def _resolve_status(*, mastery_score: float, trend_last_7_days: float) -> str:
    if trend_last_7_days > 0.02:
        return "improving"
    if trend_last_7_days < -0.02:
        return "needs_attention"
    if mastery_score < 0.4:
        return "needs_attention"
    return "stable"


def _trend_by_subject_last_7_days(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    subjects: list[str],
) -> dict[str, float]:
    if len(subjects) == 0 or not hasattr(db, "execute"):
        return {}

    normalized_subjects = [str(item).strip().lower() for item in subjects if str(item).strip()]
    if len(normalized_subjects) == 0:
        return {}

    window_start = datetime.now(UTC) - timedelta(days=7)
    alpha = float(settings.axion_subject_mastery_alpha or 0.05)
    beta = float(settings.axion_subject_mastery_beta or 0.08)

    trend_expr = func.sum(
        case(
            (ChildContentHistory.mastery_delta.is_not(None), ChildContentHistory.mastery_delta),
            (func.lower(ChildContentHistory.outcome) == "correct", alpha),
            (func.lower(ChildContentHistory.outcome) == "incorrect", -beta),
            else_=0.0,
        )
    )

    rows = (
        db.execute(
            select(
                func.lower(AxionContentCatalog.subject).label("subject"),
                func.coalesce(trend_expr, 0.0).label("trend_last_7_days"),
            )
            .select_from(ChildContentHistory)
            .join(AxionContentCatalog, AxionContentCatalog.content_id == ChildContentHistory.content_id)
            .where(
                ChildContentHistory.tenant_id == int(tenant_id),
                ChildContentHistory.child_id == int(child_id),
                ChildContentHistory.served_at >= window_start,
                func.lower(AxionContentCatalog.subject).in_(normalized_subjects),
            )
            .group_by(func.lower(AxionContentCatalog.subject))
        )
        .mappings()
        .all()
    )

    trend_map: dict[str, float] = {}
    for row in rows:
        subject = str(row.get("subject") or "").strip().lower()
        if not subject:
            continue
        trend_map[subject] = float(row.get("trend_last_7_days") or 0.0)
    return trend_map


def get_child_brain_state(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
) -> dict[str, object]:
    rows = db.scalars(
        select(ChildSubjectMastery).where(
            ChildSubjectMastery.tenant_id == int(tenant_id),
            ChildSubjectMastery.child_id == int(child_id),
        )
    ).all()
    if len(rows) == 0:
        return {
            "subjects": [],
            "weakest_subject": None,
            "strongest_subject": None,
            "average_mastery": 0.0,
        }

    subject_keys = [str(row.subject).strip().lower() for row in rows]
    trend_map = _trend_by_subject_last_7_days(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        subjects=subject_keys,
    )

    subjects: list[dict[str, object]] = []
    for row in rows:
        subject = str(row.subject).strip().lower()
        mastery_score = float(row.mastery_score or 0.0)
        trend = float(trend_map.get(subject, 0.0))
        subjects.append(
            {
                "subject": subject,
                "mastery_score": _round4(mastery_score),
                "trend_last_7_days": _round4(trend),
                "status": _resolve_status(
                    mastery_score=mastery_score,
                    trend_last_7_days=trend,
                ),
            }
        )

    subjects.sort(key=lambda item: float(item["mastery_score"]), reverse=True)
    average = sum(float(item["mastery_score"]) for item in subjects) / float(len(subjects))

    strongest = str(subjects[0]["subject"]) if subjects else None
    weakest = str(subjects[-1]["subject"]) if subjects else None

    return {
        "subjects": subjects,
        "weakest_subject": weakest,
        "strongest_subject": strongest,
        "average_mastery": _round4(average),
    }
