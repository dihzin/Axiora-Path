from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ToolsCatalogItemOut(BaseModel):
    slug: str
    name: str
    summary: str
    price_label: str
    status: str
    entry_path: str


class ToolsCatalogResponse(BaseModel):
    items: list[ToolsCatalogItemOut]


class ToolsGuestSessionRequest(BaseModel):
    tool_slug: str | None = Field(default=None, max_length=80)
    source_path: str = Field(default="/tools", min_length=1, max_length=255)
    utm: dict[str, str] | None = None


class ToolsGuestSessionResponse(BaseModel):
    session_token: str
    mode: str
    expires_at: datetime


class ToolsIdentifyRequest(BaseModel):
    session_token: str = Field(min_length=16, max_length=255)
    email: str = Field(min_length=5, max_length=255)
    name: str | None = Field(default=None, max_length=120)
    consent_marketing: bool = False


class ToolsIdentifyResponse(BaseModel):
    session_token: str
    mode: str
    email: str


class ToolsLinkAccountRequest(BaseModel):
    session_token: str = Field(min_length=16, max_length=255)


class ToolsLinkAccountResponse(BaseModel):
    session_token: str
    mode: str
    linked_user_id: int
    linked_tenant_id: int


class ToolsGenerateExercisesRequest(BaseModel):
    subject: str = Field(min_length=2, max_length=80)
    topic: str = Field(min_length=2, max_length=120)
    age: int = Field(ge=5, le=18)
    difficulty: str = Field(min_length=3, max_length=24)
    exercise_count: int = Field(default=8, ge=3, le=15)
    session_token: str | None = Field(default=None, min_length=16, max_length=255)


class ToolsExerciseItemOut(BaseModel):
    number: int
    prompt: str
    answer: str


class ToolsGenerateExercisesResponse(BaseModel):
    title: str
    instructions: str
    exercises: list[ToolsExerciseItemOut]
    answer_key: list[ToolsExerciseItemOut]
    pdf_html: str
    free_limit: int
    free_used: int
    remaining_free_generations: int
    paywall_required: bool
    upgrade_url: str
    llm_mode: str
    paid_credits_remaining: int


class ToolsCheckoutSessionRequest(BaseModel):
    plan_code: str = Field(default="credits_30", min_length=3, max_length=60)
    session_token: str | None = Field(default=None, min_length=16, max_length=255)
    customer_email: str | None = Field(default=None, max_length=255)


class ToolsCheckoutSessionResponse(BaseModel):
    checkout_url: str
    checkout_session_id: str


class ToolsBillingStatusResponse(BaseModel):
    free_limit: int
    free_used: int
    remaining_free_generations: int
    paid_credits_remaining: int


class ToolsCreditsResponse(BaseModel):
    credits: int


class ToolsPricingPackOut(BaseModel):
    code: str
    credits: int
    price_cents: int
    price_label: str
    currency: str


class ToolsPricingResponse(BaseModel):
    packs: list[ToolsPricingPackOut]
