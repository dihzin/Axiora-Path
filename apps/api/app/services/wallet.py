from __future__ import annotations

from typing import Any

from app.models import LedgerTransactionType, PotType


def split_amount_by_pots(amount_cents: int, allocations: dict[PotType, int]) -> dict[str, int]:
    if amount_cents < 0:
        raise ValueError("amount_cents must be >= 0")

    if not allocations:
        return {"SPEND": amount_cents, "SAVE": 0, "DONATE": 0}

    pots = [PotType.SPEND, PotType.SAVE, PotType.DONATE]
    split: dict[str, int] = {}
    assigned = 0
    for pot in pots:
        percent = allocations.get(pot, 0)
        value = (amount_cents * percent) // 100
        split[pot.value] = value
        assigned += value

    remainder = amount_cents - assigned
    split[PotType.SPEND.value] = split[PotType.SPEND.value] + remainder
    return split


def signed_amount_cents(tx_type: LedgerTransactionType, amount_cents: int) -> int:
    if tx_type in {LedgerTransactionType.EARN, LedgerTransactionType.ALLOWANCE, LedgerTransactionType.LOAN}:
        return amount_cents
    if tx_type == LedgerTransactionType.SPEND:
        return -amount_cents
    return amount_cents


def extract_pot_split(metadata: dict[str, Any]) -> dict[str, int]:
    value = metadata.get("pot_split")
    if not isinstance(value, dict):
        return {}

    result: dict[str, int] = {}
    for key in ("SPEND", "SAVE", "DONATE"):
        raw = value.get(key, 0)
        result[key] = raw if isinstance(raw, int) else 0
    return result

