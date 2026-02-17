from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.models import Membership, ParentalConsent, Tenant, User
from app.schemas.legal import LegalAcceptRequest, LegalAcceptResponse, LegalStatusResponse

router = APIRouter(tags=["legal"])
DEFAULT_RETENTION_POLICY_VERSION = "v1"


@router.get("/legal", response_model=LegalStatusResponse)
def get_legal_status(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT"]))],
) -> LegalStatusResponse:
    consent = db.get(ParentalConsent, tenant.id)
    return LegalStatusResponse(
        tenant_id=tenant.id,
        consent_required=consent is None or consent.accepted_terms_at is None or consent.accepted_privacy_at is None,
        accepted_terms_at=consent.accepted_terms_at if consent else None,
        accepted_privacy_at=consent.accepted_privacy_at if consent else None,
        data_retention_policy_version=consent.data_retention_policy_version if consent else None,
        coppa_ready=False,
    )


@router.post("/legal/accept", response_model=LegalAcceptResponse)
def accept_legal(
    payload: LegalAcceptRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT"]))],
) -> LegalAcceptResponse:
    now = datetime.now(UTC)
    consent = db.get(ParentalConsent, tenant.id)
    if consent is None:
        consent = ParentalConsent(
            tenant_id=tenant.id,
            accepted_terms_at=now,
            accepted_privacy_at=now,
            data_retention_policy_version=payload.data_retention_policy_version or DEFAULT_RETENTION_POLICY_VERSION,
        )
        db.add(consent)
    else:
        consent.accepted_terms_at = now
        consent.accepted_privacy_at = now
        consent.data_retention_policy_version = (
            payload.data_retention_policy_version or DEFAULT_RETENTION_POLICY_VERSION
        )

    events.emit(
        type="legal.accepted",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=None,
        payload={"data_retention_policy_version": consent.data_retention_policy_version},
    )
    db.commit()
    return LegalAcceptResponse(
        accepted=True,
        accepted_terms_at=consent.accepted_terms_at,
        accepted_privacy_at=consent.accepted_privacy_at,
        data_retention_policy_version=consent.data_retention_policy_version,
    )
