from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class LegalStatusResponse(BaseModel):
    tenant_id: int
    consent_required: bool
    accepted_terms_at: datetime | None
    accepted_privacy_at: datetime | None
    data_retention_policy_version: str | None
    coppa_ready: bool


class LegalAcceptRequest(BaseModel):
    data_retention_policy_version: str


class LegalAcceptResponse(BaseModel):
    accepted: bool
    accepted_terms_at: datetime
    accepted_privacy_at: datetime
    data_retention_policy_version: str
