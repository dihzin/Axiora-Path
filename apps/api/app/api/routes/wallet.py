from __future__ import annotations

import math
from datetime import date, timedelta
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
    SavingGoal,
    Tenant,
    User,
    Wallet,
)
from app.schemas.wallet import (
    AllowanceRunRequest,
    GoalCreateRequest,
    GoalOut,
    GoalProjectionResponse,
    LedgerTransactionOut,
    WalletSummaryResponse,
)
from app.services.wallet import extract_pot_split, signed_amount_cents, split_amount_by_pots

router = APIRouter(tags=["wallet"])


def _get_child_and_wallet(db: DBSession, tenant_id: int, child_id: int) -> tuple[ChildProfile, Wallet]:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant_id,
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    wallet = db.scalar(
        select(Wallet).where(
            Wallet.tenant_id == tenant_id,
            Wallet.child_id == child_id,
        ),
    )
    if wallet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")

    return child, wallet


def _build_wallet_summary(db: DBSession, tenant_id: int, wallet: Wallet, child_id: int) -> WalletSummaryResponse:
    transactions = db.scalars(
        select(LedgerTransaction)
        .where(
            LedgerTransaction.tenant_id == tenant_id,
            LedgerTransaction.wallet_id == wallet.id,
        )
        .order_by(LedgerTransaction.created_at.asc()),
    ).all()

    total_balance = 0
    pot_balances = {"SPEND": 0, "SAVE": 0, "DONATE": 0}
    for tx in transactions:
        signed = signed_amount_cents(tx.type, tx.amount_cents)
        total_balance += signed

        split = extract_pot_split(tx.metadata_json)
        for pot in ("SPEND", "SAVE", "DONATE"):
            pot_balances[pot] += split.get(pot, 0) if signed >= 0 else -split.get(pot, 0)

    return WalletSummaryResponse(
        child_id=child_id,
        wallet_id=wallet.id,
        currency_code=wallet.currency_code,
        total_balance_cents=total_balance,
        pot_balances_cents=pot_balances,
    )


@router.get("/wallet/summary", response_model=WalletSummaryResponse)
def wallet_summary(
    child_id: Annotated[int, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> WalletSummaryResponse:
    _, wallet = _get_child_and_wallet(db, tenant.id, child_id)
    return _build_wallet_summary(db, tenant.id, wallet, child_id)


@router.post("/wallet/allowance/run", response_model=LedgerTransactionOut, status_code=status.HTTP_201_CREATED)
def wallet_allowance_run(
    payload: AllowanceRunRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> LedgerTransactionOut:
    _, wallet = _get_child_and_wallet(db, tenant.id, payload.child_id)

    allocations = db.scalars(
        select(PotAllocation).where(
            PotAllocation.tenant_id == tenant.id,
            PotAllocation.wallet_id == wallet.id,
        ),
    ).all()
    allocation_map = {allocation.pot: allocation.percent for allocation in allocations}
    pot_split = split_amount_by_pots(payload.amount_cents, allocation_map)

    tx = LedgerTransaction(
        tenant_id=tenant.id,
        wallet_id=wallet.id,
        type=LedgerTransactionType.ALLOWANCE,
        amount_cents=payload.amount_cents,
        metadata_json={
            "source": "wallet.allowance.run",
            "child_id": payload.child_id,
            "pot_split": pot_split,
        },
    )
    db.add(tx)
    db.flush()

    events.emit(
        type="wallet.allowance.ran",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=payload.child_id,
        payload={"transaction_id": tx.id, "amount_cents": payload.amount_cents},
    )
    db.commit()

    return LedgerTransactionOut(
        id=tx.id,
        type=tx.type.value,
        amount_cents=tx.amount_cents,
        metadata=tx.metadata_json,
        created_at=tx.created_at,
    )


@router.post("/goals", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreateRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> GoalOut:
    _get_child_and_wallet(db, tenant.id, payload.child_id)

    goal = SavingGoal(
        tenant_id=tenant.id,
        child_id=payload.child_id,
        title=payload.title,
        target_cents=payload.target_cents,
        image_url=payload.image_url,
        is_locked=payload.is_locked,
    )
    db.add(goal)
    db.flush()

    events.emit(
        type="goal.created",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=payload.child_id,
        payload={"goal_id": goal.id},
    )
    db.commit()
    return GoalOut(
        id=goal.id,
        child_id=goal.child_id,
        title=goal.title,
        target_cents=goal.target_cents,
        image_url=goal.image_url,
        is_locked=goal.is_locked,
        created_at=goal.created_at,
    )


@router.get("/goals", response_model=list[GoalOut])
def list_goals(
    child_id: Annotated[int, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> list[GoalOut]:
    _get_child_and_wallet(db, tenant.id, child_id)
    goals = db.scalars(
        select(SavingGoal)
        .where(
            SavingGoal.tenant_id == tenant.id,
            SavingGoal.child_id == child_id,
        )
        .order_by(SavingGoal.created_at.asc(), SavingGoal.id.asc()),
    ).all()
    return [
        GoalOut(
            id=goal.id,
            child_id=goal.child_id,
            title=goal.title,
            target_cents=goal.target_cents,
            image_url=goal.image_url,
            is_locked=goal.is_locked,
            created_at=goal.created_at,
        )
        for goal in goals
    ]


@router.get("/goals/projection", response_model=GoalProjectionResponse)
def goal_projection(
    child_id: Annotated[int, Query()],
    goal_id: Annotated[int, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> GoalProjectionResponse:
    _, wallet = _get_child_and_wallet(db, tenant.id, child_id)

    goal = db.scalar(
        select(SavingGoal).where(
            SavingGoal.id == goal_id,
            SavingGoal.tenant_id == tenant.id,
            SavingGoal.child_id == child_id,
        ),
    )
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    transactions = db.scalars(
        select(LedgerTransaction)
        .where(
            LedgerTransaction.tenant_id == tenant.id,
            LedgerTransaction.wallet_id == wallet.id,
        )
        .order_by(LedgerTransaction.created_at.asc()),
    ).all()

    saved_total = 0
    recent_daily: dict[date, int] = {}
    threshold = date.today() - timedelta(days=29)
    for tx in transactions:
        signed = signed_amount_cents(tx.type, tx.amount_cents)
        split = extract_pot_split(tx.metadata_json)
        save_amount = split.get("SAVE", 0)
        if save_amount == 0:
            continue

        if signed >= 0:
            saved_total += save_amount
            if tx.created_at.date() >= threshold:
                recent_daily[tx.created_at.date()] = recent_daily.get(tx.created_at.date(), 0) + save_amount
        else:
            saved_total -= save_amount
            if tx.created_at.date() >= threshold:
                recent_daily[tx.created_at.date()] = recent_daily.get(tx.created_at.date(), 0) - save_amount

    remaining = max(goal.target_cents - saved_total, 0)
    avg_daily = sum(recent_daily.values()) / 30.0

    projected_days: int | None = None
    projected_date: date | None = None
    if remaining == 0:
        projected_days = 0
        projected_date = date.today()
    elif avg_daily > 0:
        projected_days = math.ceil(remaining / avg_daily)
        projected_date = date.today() + timedelta(days=projected_days)

    return GoalProjectionResponse(
        goal_id=goal.id,
        child_id=child_id,
        target_cents=goal.target_cents,
        saved_cents=saved_total,
        remaining_cents=remaining,
        avg_daily_save_cents=avg_daily,
        projected_days=projected_days,
        projected_completion_date=projected_date,
    )
