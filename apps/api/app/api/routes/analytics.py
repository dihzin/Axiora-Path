from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.deps import DBSession, get_current_tenant, require_role
from app.models import ChildProfile, LedgerTransaction, LedgerTransactionType, Membership, TaskLog, TaskLogStatus, Tenant, Wallet
from app.schemas.analytics import WeeklyTrendResponse

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _delta_percent(current: float, previous: float) -> float:
    if previous == 0:
        if current == 0:
            return 0.0
        return 100.0
    return ((current - previous) / previous) * 100.0


@router.get("/weekly-trend", response_model=WeeklyTrendResponse)
def get_weekly_trend(
    child_id: Annotated[int, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> WeeklyTrendResponse:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    today = date.today()
    current_start = today - timedelta(days=6)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=6)

    current_logs = db.scalars(
        select(TaskLog).where(
            TaskLog.tenant_id == tenant.id,
            TaskLog.child_id == child_id,
            TaskLog.date >= current_start,
            TaskLog.date <= today,
        ),
    ).all()
    previous_logs = db.scalars(
        select(TaskLog).where(
            TaskLog.tenant_id == tenant.id,
            TaskLog.child_id == child_id,
            TaskLog.date >= previous_start,
            TaskLog.date <= previous_end,
        ),
    ).all()

    current_approved = sum(1 for item in current_logs if item.status == TaskLogStatus.APPROVED)
    previous_approved = sum(1 for item in previous_logs if item.status == TaskLogStatus.APPROVED)
    current_completion = (current_approved / len(current_logs)) if current_logs else 0.0
    previous_completion = (previous_approved / len(previous_logs)) if previous_logs else 0.0

    wallet = db.scalar(
        select(Wallet).where(
            Wallet.tenant_id == tenant.id,
            Wallet.child_id == child_id,
        ),
    )
    if wallet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")

    current_earnings = sum(
        tx.amount_cents
        for tx in db.scalars(
            select(LedgerTransaction).where(
                LedgerTransaction.tenant_id == tenant.id,
                LedgerTransaction.wallet_id == wallet.id,
                LedgerTransaction.type == LedgerTransactionType.EARN,
                func.date(LedgerTransaction.created_at) >= current_start,
                func.date(LedgerTransaction.created_at) <= today,
            ),
        ).all()
    )
    previous_earnings = sum(
        tx.amount_cents
        for tx in db.scalars(
            select(LedgerTransaction).where(
                LedgerTransaction.tenant_id == tenant.id,
                LedgerTransaction.wallet_id == wallet.id,
                LedgerTransaction.type == LedgerTransactionType.EARN,
                func.date(LedgerTransaction.created_at) >= previous_start,
                func.date(LedgerTransaction.created_at) <= previous_end,
            ),
        ).all()
    )

    return WeeklyTrendResponse(
        completion_delta_percent=round(_delta_percent(current_completion, previous_completion), 2),
        earnings_delta_percent=round(_delta_percent(float(current_earnings), float(previous_earnings)), 2),
    )
