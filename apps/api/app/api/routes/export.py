from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, require_role
from app.models import (
    ChildProfile,
    DailyMood,
    LedgerTransaction,
    Membership,
    Recommendation,
    SavingGoal,
    Streak,
    Task,
    TaskLog,
    Tenant,
    Wallet,
)
from app.schemas.export import (
    ExportDataResponse,
    ExportGoalOut,
    ExportLedgerTransactionOut,
    ExportMoodOut,
    ExportRecommendationOut,
    ExportStreakOut,
    ExportTaskLogOut,
    ExportTaskOut,
)

router = APIRouter(tags=["export"])


@router.get("/export-data", response_model=ExportDataResponse)
def export_data(
    child_id: Annotated[int, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT"]))],
) -> ExportDataResponse:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    tasks = db.scalars(
        select(Task).where(Task.tenant_id == tenant.id, Task.deleted_at.is_(None)).order_by(Task.id.asc()),
    ).all()
    logs = db.scalars(
        select(TaskLog)
        .where(
            TaskLog.tenant_id == tenant.id,
            TaskLog.child_id == child_id,
        )
        .order_by(TaskLog.date.asc(), TaskLog.id.asc()),
    ).all()
    wallet = db.scalar(
        select(Wallet).where(
            Wallet.tenant_id == tenant.id,
            Wallet.child_id == child_id,
        ),
    )
    wallet_transactions = (
        db.scalars(
            select(LedgerTransaction)
            .where(
                LedgerTransaction.tenant_id == tenant.id,
                LedgerTransaction.wallet_id == wallet.id,
            )
            .order_by(LedgerTransaction.created_at.asc(), LedgerTransaction.id.asc()),
        ).all()
        if wallet is not None
        else []
    )
    streak = db.get(Streak, child_id)
    goals = db.scalars(
        select(SavingGoal)
        .where(
            SavingGoal.tenant_id == tenant.id,
            SavingGoal.child_id == child_id,
        )
        .order_by(SavingGoal.created_at.asc(), SavingGoal.id.asc()),
    ).all()
    recommendations = db.scalars(
        select(Recommendation)
        .where(Recommendation.child_id == child_id)
        .order_by(Recommendation.created_at.asc(), Recommendation.id.asc()),
    ).all()
    mood_history = db.scalars(
        select(DailyMood)
        .where(DailyMood.child_id == child_id)
        .order_by(DailyMood.date.asc()),
    ).all()

    return ExportDataResponse(
        tasks=[
            ExportTaskOut(
                id=item.id,
                tenant_id=item.tenant_id,
                title=item.title,
                description=item.description,
                difficulty=item.difficulty.value,
                weight=item.weight,
                is_active=item.is_active,
            )
            for item in tasks
        ],
        logs=[
            ExportTaskLogOut(
                id=item.id,
                tenant_id=item.tenant_id,
                child_id=item.child_id,
                task_id=item.task_id,
                date=item.date,
                status=item.status.value,
                created_at=item.created_at,
                decided_at=item.decided_at,
                decided_by_user_id=item.decided_by_user_id,
                parent_comment=item.parent_comment,
            )
            for item in logs
        ],
        wallet_transactions=[
            ExportLedgerTransactionOut(
                id=item.id,
                tenant_id=item.tenant_id,
                wallet_id=item.wallet_id,
                type=item.type.value,
                amount_cents=item.amount_cents,
                metadata=item.metadata_json,
                created_at=item.created_at,
            )
            for item in wallet_transactions
        ],
        streak=(
            ExportStreakOut(
                child_id=streak.child_id,
                current=streak.current,
                last_date=streak.last_date,
                freeze_used_today=streak.freeze_used_today,
                freeze_tokens=streak.freeze_tokens,
            )
            if streak is not None
            else None
        ),
        goals=[
            ExportGoalOut(
                id=item.id,
                tenant_id=item.tenant_id,
                child_id=item.child_id,
                title=item.title,
                target_cents=item.target_cents,
                image_url=item.image_url,
                is_locked=item.is_locked,
                created_at=item.created_at,
            )
            for item in goals
        ],
        recommendations=[
            ExportRecommendationOut(
                id=item.id,
                child_id=item.child_id,
                type=item.type,
                title=item.title,
                body=item.body,
                severity=item.severity,
                created_at=item.created_at,
                dismissed_at=item.dismissed_at,
            )
            for item in recommendations
        ],
        mood_history=[
            ExportMoodOut(
                child_id=item.child_id,
                date=item.date,
                mood=item.mood.value,
            )
            for item in mood_history
        ],
    )
