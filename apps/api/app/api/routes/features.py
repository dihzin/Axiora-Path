from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import DBSession, get_current_tenant, require_role
from app.models import Membership, Tenant
from app.schemas.features import FeatureFlagOut, FeatureListResponse
from app.services.features import DEFAULT_FEATURE_NAMES, is_feature_enabled

router = APIRouter(tags=["features"])


@router.get("/features", response_model=FeatureListResponse)
def list_features(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> FeatureListResponse:
    return FeatureListResponse(
        features=[
            FeatureFlagOut(
                name=name,
                enabled=is_feature_enabled(name, db, tenant_id=tenant.id),
            )
            for name in DEFAULT_FEATURE_NAMES
        ],
    )
