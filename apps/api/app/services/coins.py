from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    ChildProfile,
    CoinConversion,
    GameSettings,
    LedgerTransaction,
    LedgerTransactionType,
    UserGameProfile,
    Wallet,
)

COINS_PER_REAL = 10


def _coins_to_cents(coins_used: int) -> int:
    rate = COINS_PER_REAL
    return max(0, (coins_used * 100) // rate)


def _conversion_rate_label() -> str:
    rate = COINS_PER_REAL
    return f"{rate} AxionCoins = R$ 1,00"


def _get_wallet_or_404(db: Session, *, tenant_id: int, child_id: int) -> Wallet:
    wallet = db.scalar(
        select(Wallet).where(
            Wallet.tenant_id == tenant_id,
            Wallet.child_id == child_id,
        ),
    )
    if wallet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")
    return wallet


def _get_profile_or_404(db: Session, *, user_id: int) -> UserGameProfile:
    profile = db.scalar(select(UserGameProfile).where(UserGameProfile.user_id == user_id))
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game profile not found")
    return profile


def _resolve_child_for_tenant_or_400(db: Session, *, tenant_id: int) -> ChildProfile:
    children = db.scalars(
        select(ChildProfile)
        .where(ChildProfile.tenant_id == tenant_id, ChildProfile.deleted_at.is_(None))
        .order_by(ChildProfile.id.asc()),
    ).all()
    if not children:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child profile not found")
    if len(children) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Multiple child profiles found for tenant; conversion context is ambiguous",
        )
    return children[0]


def _week_bounds_utc(now_utc: datetime) -> tuple[datetime, datetime]:
    monday = (now_utc - timedelta(days=now_utc.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = monday + timedelta(days=7)
    return monday, week_end


def _get_weekly_coin_limit(db: Session, *, tenant_id: int, child_id: int) -> int:
    settings = db.scalar(
        select(GameSettings).where(
            GameSettings.tenant_id == tenant_id,
            GameSettings.child_id == child_id,
        ),
    )
    if settings is None:
        return 500
    return max(0, settings.max_weekly_coin_conversion)


def _get_weekly_converted_coins(db: Session, *, tenant_id: int, child_id: int, now_utc: datetime) -> int:
    week_start, week_end = _week_bounds_utc(now_utc)
    total = db.scalar(
        select(func.coalesce(func.sum(CoinConversion.coins_used), 0)).where(
            CoinConversion.tenant_id == tenant_id,
            CoinConversion.child_id == child_id,
            CoinConversion.created_at >= week_start,
            CoinConversion.created_at < week_end,
        ),
    )
    return int(total or 0)


def create_pending_conversion(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    coins_used: int,
) -> tuple[CoinConversion, int, str]:
    child = _resolve_child_for_tenant_or_400(db, tenant_id=tenant_id)
    child_id = child.id
    _get_wallet_or_404(db, tenant_id=tenant_id, child_id=child_id)
    profile = _get_profile_or_404(db, user_id=user_id)
    if profile.axion_coins < coins_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient AxionCoins",
        )

    amount_generated = _coins_to_cents(coins_used)
    if amount_generated <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid conversion amount",
        )

    now_utc = datetime.now(timezone.utc)
    weekly_limit = _get_weekly_coin_limit(db, tenant_id=tenant_id, child_id=child_id)
    weekly_used = _get_weekly_converted_coins(db, tenant_id=tenant_id, child_id=child_id, now_utc=now_utc)
    if weekly_used + coins_used > weekly_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Weekly coin conversion limit exceeded",
        )

    conversion = CoinConversion(
        tenant_id=tenant_id,
        child_id=child_id,
        user_id=user_id,
        coins_used=coins_used,
        amount_generated=amount_generated,
        approved=False,
        approved_at=None,
    )
    db.add(conversion)
    db.flush()
    return conversion, profile.axion_coins, _conversion_rate_label()


def list_pending_conversions(db: Session, *, tenant_id: int) -> list[CoinConversion]:
    return db.scalars(
        select(CoinConversion)
        .where(
            CoinConversion.tenant_id == tenant_id,
            CoinConversion.approved.is_(False),
        )
        .order_by(CoinConversion.created_at.asc(), CoinConversion.id.asc()),
    ).all()


@dataclass(slots=True)
class DecideConversionResult:
    conversion: CoinConversion
    approved: bool
    profile_coins: int


def decide_conversion(
    db: Session,
    *,
    tenant_id: int,
    conversion_id: str,
) -> DecideConversionResult:
    conversion = db.scalar(
        select(CoinConversion).where(
            CoinConversion.id == conversion_id,
            CoinConversion.tenant_id == tenant_id,
        ),
    )
    if conversion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversion not found")

    profile = _get_profile_or_404(db, user_id=conversion.user_id)

    if conversion.approved:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conversion already approved",
        )

    if profile.axion_coins < conversion.coins_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient AxionCoins",
        )

    wallet = _get_wallet_or_404(db, tenant_id=tenant_id, child_id=conversion.child_id)

    profile.axion_coins -= conversion.coins_used
    conversion.approved = True
    conversion.approved_at = datetime.now(timezone.utc)

    tx = LedgerTransaction(
        tenant_id=tenant_id,
        wallet_id=wallet.id,
        type=LedgerTransactionType.EARN,
        amount_cents=conversion.amount_generated,
        metadata_json={
            "source": "coin_conversion.approved",
            "conversion_id": conversion.id,
            "pot_split": {
                "SPEND": conversion.amount_generated,
                "SAVE": 0,
                "DONATE": 0,
            },
        },
    )
    db.add(tx)
    db.flush()

    return DecideConversionResult(
        conversion=conversion,
        approved=True,
        profile_coins=profile.axion_coins,
    )
