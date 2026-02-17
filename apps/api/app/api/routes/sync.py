from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import ChildProfile, Membership, Task, TaskLog, TaskLogStatus, Tenant, User
from app.schemas.sync import SyncBatchFailedItem, SyncBatchItem, SyncBatchRequest, SyncBatchResponse

router = APIRouter(prefix="/sync", tags=["sync"])


def _error_message(exc: Exception) -> str:
    if isinstance(exc, HTTPException):
        return str(exc.detail)
    return str(exc)


def _process_routine_mark(
    item: SyncBatchItem,
    tenant: Tenant,
    user: User,
    db: DBSession,
    events: EventSvc,
) -> None:
    raw_child_id = item.payload.get("child_id")
    raw_task_id = item.payload.get("task_id")
    raw_date = item.payload.get("date")
    if not isinstance(raw_child_id, int) or not isinstance(raw_task_id, int) or not isinstance(raw_date, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid routine.mark payload")

    mark_date = date.fromisoformat(raw_date)
    if mark_date > date.today():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Future dates are not allowed")

    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == raw_child_id,
            ChildProfile.tenant_id == tenant.id,
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    task = db.scalar(
        select(Task).where(
            Task.id == raw_task_id,
            Task.tenant_id == tenant.id,
            Task.is_active.is_(True),
        ),
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    existing = db.scalar(
        select(TaskLog).where(
            TaskLog.tenant_id == tenant.id,
            TaskLog.child_id == raw_child_id,
            TaskLog.task_id == raw_task_id,
            TaskLog.date == mark_date,
        ),
    )
    if existing is not None:
        return

    log = TaskLog(
        tenant_id=tenant.id,
        child_id=raw_child_id,
        task_id=raw_task_id,
        date=mark_date,
        status=TaskLogStatus.PENDING,
    )
    db.add(log)
    db.flush()
    events.emit(
        type="routine.marked",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=raw_child_id,
        payload={"log_id": log.id, "task_id": raw_task_id, "date": str(mark_date), "source": "sync.batch"},
    )


def _process_coach_use(
    item: SyncBatchItem,
    tenant: Tenant,
    user: User,
    db: DBSession,
    events: EventSvc,
) -> None:
    raw_child_id = item.payload.get("child_id")
    raw_mode = item.payload.get("mode")
    raw_message = item.payload.get("message")
    if not isinstance(raw_child_id, int):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid coach.use payload")
    if raw_mode not in {"CHILD", "PARENT"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid coach.use mode")
    if raw_message is not None and not isinstance(raw_message, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid coach.use message")

    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == raw_child_id,
            ChildProfile.tenant_id == tenant.id,
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    events.emit(
        type="ai.coach.used",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=raw_child_id,
        payload={"mode": raw_mode, "has_message": raw_message is not None, "source": "sync.batch"},
    )


@router.post("/batch", response_model=SyncBatchResponse)
def sync_batch(
    payload: SyncBatchRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> SyncBatchResponse:
    processed = 0
    failed: list[SyncBatchFailedItem] = []

    for item in payload.items:
        try:
            if item.type == "routine.mark":
                _process_routine_mark(item, tenant, user, db, events)
            elif item.type == "coach.use":
                _process_coach_use(item, tenant, user, db, events)
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported type {item.type}")
            db.commit()
            processed += 1
        except Exception as exc:
            db.rollback()
            failed.append(
                SyncBatchFailedItem(
                    id=item.id,
                    type=item.type,
                    error=_error_message(exc),
                ),
            )

    return SyncBatchResponse(processed=processed, failed=failed)
