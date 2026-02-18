from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.models import Membership, Tenant, User
from app.schemas.coins import (
    CoinConversionOut,
    CoinConvertRequest,
    CoinConvertRequestResponse,
    ParentApproveConversionRequest,
    ParentApproveConversionResponse,
)
from app.services.coins import (
    create_pending_conversion,
    decide_conversion,
    list_pending_conversions,
)

router = APIRouter(prefix="/api", tags=["coins"])


@router.post(
    "/coins/convert",
    response_model=CoinConvertRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def request_coin_conversion(
    payload: CoinConvertRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["CHILD"]))],
) -> CoinConvertRequestResponse:
    conversion, profile_coins, rate_label = create_pending_conversion(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        coins_used=payload.coins,
    )
    db.commit()
    return CoinConvertRequestResponse(
        conversion=CoinConversionOut(
            id=conversion.id,
            userId=conversion.user_id,
            coinsUsed=conversion.coins_used,
            amountGenerated=conversion.amount_generated,
            approved=conversion.approved,
            approvedAt=conversion.approved_at,
            createdAt=conversion.created_at,
        ),
        conversionRate=rate_label,
        profileCoinsAfterRequest=profile_coins,
    )


@router.get("/parent/pending-conversions", response_model=list[CoinConversionOut])
def parent_pending_conversions(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT"]))],
) -> list[CoinConversionOut]:
    rows = list_pending_conversions(db, tenant_id=tenant.id)
    return [
        CoinConversionOut(
            id=row.id,
            userId=row.user_id,
            coinsUsed=row.coins_used,
            amountGenerated=row.amount_generated,
            approved=row.approved,
            approvedAt=row.approved_at,
            createdAt=row.created_at,
        )
        for row in rows
    ]


@router.post("/parent/approve-conversion", response_model=ParentApproveConversionResponse)
def parent_approve_conversion(
    payload: ParentApproveConversionRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT"]))],
) -> ParentApproveConversionResponse:
    result = decide_conversion(
        db,
        tenant_id=tenant.id,
        conversion_id=payload.conversion_id,
    )
    db.commit()

    return ParentApproveConversionResponse(
        conversion=CoinConversionOut(
            id=result.conversion.id,
            userId=result.conversion.user_id,
            coinsUsed=result.conversion.coins_used,
            amountGenerated=result.conversion.amount_generated,
            approved=result.conversion.approved,
            approvedAt=result.conversion.approved_at,
            createdAt=result.conversion.created_at,
        ),
        approved=result.approved,
        profileCoins=result.profile_coins,
    )
