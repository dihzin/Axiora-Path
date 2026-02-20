from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.core.security import hash_password, verify_password
from app.models import ChildProfile, Membership, PotAllocation, PotType, Tenant, User, Wallet
from app.schemas.onboarding import (
    OnboardingCompleteRequest,
    OnboardingCompleteResponse,
    ParentPinVerifyRequest,
    ParentPinVerifyResponse,
)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])
MAX_AVATAR_DATA_URL_CHARS = 1_500_000


def _sanitize_avatar_key(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    value = raw_value.strip()
    if not value:
        return None
    if value.startswith("data:image/"):
        if len(value) > MAX_AVATAR_DATA_URL_CHARS:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Imagem muito grande. Use até 1MB.")
        return value
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Formato de imagem inválido.")


@router.post("/complete", response_model=OnboardingCompleteResponse)
def complete_onboarding(
    payload: OnboardingCompleteRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> OnboardingCompleteResponse:
    split_total = payload.reward_split.spend + payload.reward_split.save + payload.reward_split.donate
    if split_total != 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reward split must total 100")

    child = ChildProfile(
        tenant_id=tenant.id,
        display_name=payload.child_name,
        avatar_key=_sanitize_avatar_key(payload.child_avatar_key),
        birth_year=None,
        avatar_stage=1,
        xp_total=0,
    )
    db.add(child)
    db.flush()

    wallet = Wallet(tenant_id=tenant.id, child_id=child.id, currency_code="BRL")
    db.add(wallet)
    db.flush()

    db.add_all(
        [
            PotAllocation(tenant_id=tenant.id, wallet_id=wallet.id, pot=PotType.SPEND, percent=payload.reward_split.spend),
            PotAllocation(tenant_id=tenant.id, wallet_id=wallet.id, pot=PotType.SAVE, percent=payload.reward_split.save),
            PotAllocation(tenant_id=tenant.id, wallet_id=wallet.id, pot=PotType.DONATE, percent=payload.reward_split.donate),
        ],
    )

    tenant.onboarding_completed = True
    tenant.monthly_allowance_cents = payload.monthly_allowance_cents
    tenant.parent_pin_hash = hash_password(payload.parent_pin)

    events.emit(
        type="onboarding.completed",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=child.id,
        payload={
            "monthly_allowance_cents": payload.monthly_allowance_cents,
            "reward_split": {
                "spend": payload.reward_split.spend,
                "save": payload.reward_split.save,
                "donate": payload.reward_split.donate,
            },
        },
    )
    events.emit(
        type="pin.changed",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=None,
        payload={"source": "onboarding.complete", "pin_length": len(payload.parent_pin)},
    )
    db.commit()
    return OnboardingCompleteResponse(onboarding_completed=True)


@router.post("/verify-pin", response_model=ParentPinVerifyResponse)
def verify_parent_pin(
    payload: ParentPinVerifyRequest,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> ParentPinVerifyResponse:
    if not tenant.parent_pin_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent PIN not configured")
    if not verify_password(payload.pin, tenant.parent_pin_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="PIN invalido")
    return ParentPinVerifyResponse(verified=True)
