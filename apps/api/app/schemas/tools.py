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
    # UUID v4 gerado pelo frontend e persistido no localStorage — substitui session_token
    anonymous_id: str | None = Field(default=None, min_length=36, max_length=36)


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
    anonymous_id: str | None = Field(default=None, min_length=36, max_length=36)


class ToolsAnonStatusResponse(BaseModel):
    anonymous_id: str
    free_limit: int
    free_used: int
    remaining_free_generations: int
    paid_credits_remaining: int


class ToolsAnonUseRequest(BaseModel):
    anonymous_id: str = Field(min_length=36, max_length=36)
    tool_slug: str = Field(default="exercise-generator", max_length=80)


# ── Novos endpoints de identidade anônima ─────────────────────────────────────

class AnonIdentityOut(BaseModel):
    """Shape canônico do estado de identidade — usado em múltiplas respostas."""

    anonymous_id: str
    free_generations_used: int
    free_generations_remaining: int
    paid_generations_available: int
    can_generate: bool


class AnonIdentifyRequest(BaseModel):
    anonymous_id: str = Field(min_length=36, max_length=36)
    fingerprint_id: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    user_agent: str | None = Field(default=None, max_length=512)


class AnonIdentifyResponse(BaseModel):
    ok: bool
    identity: AnonIdentityOut


class AnonUsageStatusResponse(BaseModel):
    free_generations_used: int
    free_generations_remaining: int
    paid_generations_available: int
    can_generate: bool
    paywall_required: bool


# ── Endpoint canônico de geração (/api/tools/generate) ────────────────────────

class ToolsGenerateRequest(BaseModel):
    """Request do endpoint canônico de geração — combina campos pedagógicos e identidade."""

    subject: str = Field(min_length=2, max_length=80)
    topic: str = Field(min_length=2, max_length=120)
    age: int = Field(ge=5, le=18)
    difficulty: str = Field(min_length=3, max_length=24)
    exercise_count: int = Field(default=8, ge=3, le=15)
    anonymous_id: str | None = Field(default=None, min_length=36, max_length=36)
    session_token: str | None = Field(default=None, min_length=16, max_length=255)


class ToolsGenerateResponse(BaseModel):
    """Resposta quando a geração é permitida e bem-sucedida."""

    ok: bool = True
    generated: bool = True
    consumption_type: str  # 'free' | 'paid' | 'auth'
    free_generations_remaining: int
    paid_generations_available: int
    pdf_url: str | None = None  # reservado para futura geração de arquivo
    preview_data: dict  # title, instructions, exercises, answer_key, pdf_html, llm_mode


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


class ToolsSessionResponse(BaseModel):
    user_id: int
    email: str
    name: str


class ToolsPricingPackOut(BaseModel):
    code: str
    credits: int
    price_cents: int
    price_label: str
    currency: str


class ToolsPricingResponse(BaseModel):
    packs: list[ToolsPricingPackOut]


# ── Checkout canônico v2 ───────────────────────────────────────────────────────

PACKAGE_TYPE_LITERAL = str  # 'pack_30' — extensível sem breaking change


class ToolsCheckoutCreateRequest(BaseModel):
    """Payload do endpoint canônico POST /api/tools/checkout/create."""

    anonymous_id: str = Field(min_length=36, max_length=36)
    fingerprint_id: str | None = Field(default=None, max_length=255)
    customer_email: str | None = Field(default=None, max_length=255)
    package_type: str = Field(default="pack_30", min_length=3, max_length=60)


class ToolsCheckoutCreateResponse(BaseModel):
    checkout_url: str
    checkout_session_id: str


class ToolsCheckoutStatusResponse(BaseModel):
    """Resposta de GET /api/tools/checkout/status?session_id=..."""

    ok: bool = True
    payment_status: str  # 'created' | 'pending' | 'paid' | 'completed' | 'expired'
    credits_added: int   # Créditos concedidos nesta compra (0 se ainda não pago)
    paid_generations_available: int  # Saldo atual da identidade
