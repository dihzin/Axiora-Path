from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import LedgerTransaction, SavingGoal, Wallet
from app.services.wallet import extract_pot_split, signed_amount_cents


def calculate_saved_total_for_child(db: Session, *, tenant_id: int, child_id: int) -> int:
    wallet = db.scalar(
        select(Wallet).where(
            Wallet.tenant_id == tenant_id,
            Wallet.child_id == child_id,
        ),
    )
    if wallet is None:
        return 0

    transactions = db.scalars(
        select(LedgerTransaction)
        .where(
            LedgerTransaction.tenant_id == tenant_id,
            LedgerTransaction.wallet_id == wallet.id,
        )
        .order_by(LedgerTransaction.created_at.asc(), LedgerTransaction.id.asc()),
    ).all()

    saved_total = 0
    for tx in transactions:
        signed = signed_amount_cents(tx.type, tx.amount_cents)
        save_amount = extract_pot_split(tx.metadata_json).get("SAVE", 0)
        if save_amount == 0:
            continue
        saved_total += save_amount if signed >= 0 else -save_amount
    return saved_total


def sync_locked_goals_for_child(db: Session, *, tenant_id: int, child_id: int) -> list[int]:
    saved_total = calculate_saved_total_for_child(db, tenant_id=tenant_id, child_id=child_id)
    locked_goals = db.scalars(
        select(SavingGoal)
        .where(
            SavingGoal.tenant_id == tenant_id,
            SavingGoal.child_id == child_id,
            SavingGoal.is_locked.is_(True),
        )
        .order_by(SavingGoal.created_at.asc(), SavingGoal.id.asc()),
    ).all()

    unlocked_ids: list[int] = []
    for goal in locked_goals:
        if saved_total >= goal.target_cents:
            goal.is_locked = False
            unlocked_ids.append(goal.id)
    return unlocked_ids
