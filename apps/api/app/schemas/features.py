from __future__ import annotations

from pydantic import BaseModel


class FeatureFlagOut(BaseModel):
    name: str
    enabled: bool


class FeatureListResponse(BaseModel):
    features: list[FeatureFlagOut]
