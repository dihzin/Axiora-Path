from __future__ import annotations

from pydantic import BaseModel, Field


class RewardSplitInput(BaseModel):
    spend: int = Field(ge=0, le=100)
    save: int = Field(ge=0, le=100)
    donate: int = Field(ge=0, le=100)


class OnboardingCompleteRequest(BaseModel):
    child_name: str
    reward_split: RewardSplitInput
    monthly_allowance_cents: int = Field(ge=0)
    parent_pin: str = Field(min_length=4, max_length=12)


class OnboardingCompleteResponse(BaseModel):
    onboarding_completed: bool


class ParentPinVerifyRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=12)


class ParentPinVerifyResponse(BaseModel):
    verified: bool
