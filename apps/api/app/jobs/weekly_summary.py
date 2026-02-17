from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChildProfile, EventLog, TaskLog, TaskLogStatus


@dataclass(frozen=True)
class WeeklySummary:
    tenant_id: int
    child_id: int
    start_date: date
    end_date: date
    approved_count: int
    pending_count: int
    rejected_count: int
    completion_rate: float


def generate_weekly_summaries(db: Session, *, reference_date: date | None = None) -> list[WeeklySummary]:
    today = reference_date or date.today()
    start_date = today - timedelta(days=today.weekday())
    end_date = start_date + timedelta(days=6)

    children = db.scalars(
        select(ChildProfile).where(ChildProfile.deleted_at.is_(None)).order_by(ChildProfile.id.asc()),
    ).all()
    results: list[WeeklySummary] = []

    for child in children:
        logs = db.scalars(
            select(TaskLog).where(
                TaskLog.tenant_id == child.tenant_id,
                TaskLog.child_id == child.id,
                TaskLog.date >= start_date,
                TaskLog.date <= end_date,
            ),
        ).all()
        approved_count = sum(1 for item in logs if item.status == TaskLogStatus.APPROVED)
        pending_count = sum(1 for item in logs if item.status == TaskLogStatus.PENDING)
        rejected_count = sum(1 for item in logs if item.status == TaskLogStatus.REJECTED)
        total = len(logs)
        completion_rate = (approved_count / total * 100) if total > 0 else 0.0

        summary = WeeklySummary(
            tenant_id=child.tenant_id,
            child_id=child.id,
            start_date=start_date,
            end_date=end_date,
            approved_count=approved_count,
            pending_count=pending_count,
            rejected_count=rejected_count,
            completion_rate=round(completion_rate, 2),
        )
        results.append(summary)

        db.add(
            EventLog(
                tenant_id=child.tenant_id,
                actor_user_id=None,
                child_id=child.id,
                type="weekly.summary.generated",
                payload={
                    "start_date": str(start_date),
                    "end_date": str(end_date),
                    "approved_count": approved_count,
                    "pending_count": pending_count,
                    "rejected_count": rejected_count,
                    "completion_rate": summary.completion_rate,
                },
            ),
        )

    return results
