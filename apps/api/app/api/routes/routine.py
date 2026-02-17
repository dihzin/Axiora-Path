from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import (
    ChildProfile,
    LedgerTransaction,
    LedgerTransactionType,
    Membership,
    PotAllocation,
    Task,
    TaskDifficulty,
    TaskLog,
    TaskLogStatus,
    Tenant,
    User,
    Wallet,
)
from app.schemas.routine import (
    RoutineDecideRequest,
    RoutineMarkRequest,
    RoutineWeekResponse,
    TaskCreateRequest,
    TaskLogOut,
    TaskOut,
    TaskUpdateRequest,
)
from app.services.rewards import REWARD_BASE_TABLE, calculate_reward_cents
from app.services.wallet import split_amount_by_pots

router = APIRouter(tags=["routine"])


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> list[TaskOut]:
    tasks = db.scalars(
        select(Task).where(Task.tenant_id == tenant.id).order_by(Task.id.asc()),
    ).all()
    return [
        TaskOut(
            id=task.id,
            title=task.title,
            description=task.description,
            difficulty=task.difficulty.value,
            weight=task.weight,
            is_active=task.is_active,
        )
        for task in tasks
    ]


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreateRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> TaskOut:
    task = Task(
        tenant_id=tenant.id,
        title=payload.title,
        description=payload.description,
        difficulty=TaskDifficulty(payload.difficulty),
        weight=payload.weight,
        is_active=True,
    )
    db.add(task)
    db.flush()

    events.emit(
        type="task.created",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=None,
        payload={"task_id": task.id},
    )
    db.commit()
    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        difficulty=task.difficulty.value,
        weight=task.weight,
        is_active=task.is_active,
    )


@router.put("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    payload: TaskUpdateRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> TaskOut:
    task = db.scalar(select(Task).where(Task.id == task_id, Task.tenant_id == tenant.id))
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    task.title = payload.title
    task.description = payload.description
    task.difficulty = TaskDifficulty(payload.difficulty)
    task.weight = payload.weight
    task.is_active = payload.is_active

    events.emit(
        type="task.updated",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=None,
        payload={"task_id": task.id},
    )
    db.commit()
    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        difficulty=task.difficulty.value,
        weight=task.weight,
        is_active=task.is_active,
    )


@router.delete("/tasks/{task_id}", response_model=TaskOut)
def delete_task(
    task_id: int,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> TaskOut:
    task = db.scalar(select(Task).where(Task.id == task_id, Task.tenant_id == tenant.id))
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    task.is_active = False
    events.emit(
        type="task.deleted",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=None,
        payload={"task_id": task.id, "soft_delete": True},
    )
    db.commit()
    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        difficulty=task.difficulty.value,
        weight=task.weight,
        is_active=task.is_active,
    )


@router.get("/routine/week", response_model=RoutineWeekResponse)
def get_routine_week(
    child_id: Annotated[int, Query()],
    date_value: Annotated[date, Query(alias="date")],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> RoutineWeekResponse:
    if date_value > date.today():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Future dates are not allowed")

    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    start_date = date_value - timedelta(days=date_value.weekday())
    end_date = start_date + timedelta(days=6)

    logs = db.scalars(
        select(TaskLog)
        .where(
            TaskLog.tenant_id == tenant.id,
            TaskLog.child_id == child_id,
            TaskLog.date >= start_date,
            TaskLog.date <= end_date,
        )
        .order_by(TaskLog.date.asc(), TaskLog.id.asc()),
    ).all()

    return RoutineWeekResponse(
        start_date=start_date,
        end_date=end_date,
        logs=[
            TaskLogOut(
                id=log.id,
                child_id=log.child_id,
                task_id=log.task_id,
                date=log.date,
                status=log.status.value,
                created_at=log.created_at,
                decided_at=log.decided_at,
                decided_by_user_id=log.decided_by_user_id,
                parent_comment=log.parent_comment,
            )
            for log in logs
        ],
    )


@router.post("/routine/mark", response_model=TaskLogOut, status_code=status.HTTP_201_CREATED)
def mark_routine(
    payload: RoutineMarkRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> TaskLogOut:
    if payload.date > date.today():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Future dates are not allowed")

    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == payload.child_id,
            ChildProfile.tenant_id == tenant.id,
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    task = db.scalar(
        select(Task).where(
            Task.id == payload.task_id,
            Task.tenant_id == tenant.id,
            Task.is_active.is_(True),
        ),
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    existing_log = db.scalar(
        select(TaskLog).where(
            TaskLog.tenant_id == tenant.id,
            TaskLog.child_id == payload.child_id,
            TaskLog.task_id == payload.task_id,
            TaskLog.date == payload.date,
        ),
    )
    if existing_log is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Task already marked for this date")

    log = TaskLog(
        tenant_id=tenant.id,
        child_id=payload.child_id,
        task_id=payload.task_id,
        date=payload.date,
        status=TaskLogStatus.PENDING,
    )
    db.add(log)
    db.flush()

    events.emit(
        type="routine.marked",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=payload.child_id,
        payload={"log_id": log.id, "task_id": payload.task_id, "date": str(payload.date)},
    )
    db.commit()
    return TaskLogOut(
        id=log.id,
        child_id=log.child_id,
        task_id=log.task_id,
        date=log.date,
        status=log.status.value,
        created_at=log.created_at,
        decided_at=log.decided_at,
        decided_by_user_id=log.decided_by_user_id,
        parent_comment=log.parent_comment,
    )


@router.post("/routine/decide", response_model=TaskLogOut)
def decide_routine(
    payload: RoutineDecideRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> TaskLogOut:
    log = db.scalar(select(TaskLog).where(TaskLog.id == payload.log_id, TaskLog.tenant_id == tenant.id))
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routine log not found")

    if log.status != TaskLogStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Routine log already decided")

    task = db.scalar(select(Task).where(Task.id == log.task_id, Task.tenant_id == tenant.id))
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    log.decided_at = datetime.now(UTC)
    log.decided_by_user_id = user.id
    log.parent_comment = payload.parent_comment

    decision_type = "routine.rejected"
    if payload.decision == "APPROVE":
        log.status = TaskLogStatus.APPROVED
        decision_type = "routine.approved"

        wallet = db.scalar(
            select(Wallet).where(
                Wallet.tenant_id == tenant.id,
                Wallet.child_id == log.child_id,
            ),
        )
        if wallet is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found for child")

        allocations = db.scalars(
            select(PotAllocation).where(
                PotAllocation.tenant_id == tenant.id,
                PotAllocation.wallet_id == wallet.id,
            ),
        ).all()
        allocation_map = {allocation.pot: allocation.percent for allocation in allocations}
        pot_split = split_amount_by_pots(
            calculate_reward_cents(difficulty=task.difficulty, weight=task.weight),
            allocation_map,
        )

        db.add(
            LedgerTransaction(
                tenant_id=tenant.id,
                wallet_id=wallet.id,
                type=LedgerTransactionType.EARN,
                amount_cents=calculate_reward_cents(difficulty=task.difficulty, weight=task.weight),
                metadata_json={
                    "source": "routine.approve",
                    "task_log_id": log.id,
                    "task_id": task.id,
                    "child_id": log.child_id,
                    "reward_base": REWARD_BASE_TABLE[task.difficulty],
                    "weight": task.weight,
                    "pot_split": pot_split,
                },
            ),
        )
    else:
        log.status = TaskLogStatus.REJECTED

    events.emit(
        type=decision_type,
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=log.child_id,
        payload={"log_id": log.id, "decision": payload.decision},
    )
    db.commit()
    return TaskLogOut(
        id=log.id,
        child_id=log.child_id,
        task_id=log.task_id,
        date=log.date,
        status=log.status.value,
        created_at=log.created_at,
        decided_at=log.decided_at,
        decided_by_user_id=log.decided_by_user_id,
        parent_comment=log.parent_comment,
    )
