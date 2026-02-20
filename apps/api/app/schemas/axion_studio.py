from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AxionPolicyRuleOut(BaseModel):
    id: int
    name: str
    context: str
    condition: dict[str, Any]
    actions: list[dict[str, Any]]
    priority: int
    enabled: bool
    lastUpdated: datetime


class AxionPolicyRuleCreate(BaseModel):
    name: str
    context: str
    condition: dict[str, Any] = Field(default_factory=dict)
    actions: list[dict[str, Any]] = Field(default_factory=list)
    priority: int = 100
    enabled: bool = True


class AxionPolicyRulePatch(BaseModel):
    name: str | None = None
    context: str | None = None
    condition: dict[str, Any] | None = None
    actions: list[dict[str, Any]] | None = None
    priority: int | None = None
    enabled: bool | None = None


class AxionMessageTemplateOut(BaseModel):
    id: int
    context: str
    tone: str
    tags: list[str]
    conditions: dict[str, Any]
    text: str
    weight: int
    enabled: bool
    lastUpdated: datetime


class AxionMessageTemplateCreate(BaseModel):
    context: str
    tone: str
    tags: list[str] = Field(default_factory=list)
    conditions: dict[str, Any] = Field(default_factory=dict)
    text: str
    weight: int = 1
    enabled: bool = True


class AxionMessageTemplatePatch(BaseModel):
    context: str | None = None
    tone: str | None = None
    tags: list[str] | None = None
    conditions: dict[str, Any] | None = None
    text: str | None = None
    weight: int | None = None
    enabled: bool | None = None


class AxionVersionOut(BaseModel):
    id: str
    version: int
    snapshot: dict[str, Any]
    createdByUserId: int
    createdAt: datetime


class AxionRestoreRequest(BaseModel):
    version: int


class AxionPreviewRequest(BaseModel):
    userId: int
    context: str


class AxionPreviewResponse(BaseModel):
    state: dict[str, Any]
    facts: dict[str, Any]
    actions: list[dict[str, Any]]
    message: str
    tone: str
    cta: dict[str, Any]
    chosenRuleIds: list[int]
    chosenTemplateId: int | None


class AxionStudioAuditLogOut(BaseModel):
    id: int
    actorUserId: int
    action: str
    entityType: str
    entityId: str
    diff: dict[str, Any]
    createdAt: datetime


class AxionStudioUserOption(BaseModel):
    userId: int
    name: str
    email: str


class AxionImpactResponse(BaseModel):
    userId: int
    days: int
    decisionsTotal: int
    improvementRatePercent: float
    avgXpDeltaAfterBoost: float
    avgFrustrationDeltaAfterDifficultyCap: float
    avgDropoutRiskDelta: float
    masteryGrowthProxy: float


class AxionTenantSummaryOut(BaseModel):
    id: int
    name: str
    slug: str
    type: str
    onboardingCompleted: bool
    createdAt: datetime


class AxionTenantCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    slug: str = Field(min_length=3, max_length=255)
    type: str = Field(pattern="^(FAMILY|SCHOOL)$")
    adminEmail: str
    adminName: str = Field(min_length=2, max_length=255)
    adminPassword: str = Field(min_length=10)
    createTestChild: bool = False
    testChildName: str = Field(default="Filho Teste", min_length=2, max_length=255)
    testChildBirthYear: int | None = None
    resetExistingUserPassword: bool = False


class AxionTenantCreateResponse(BaseModel):
    tenant: AxionTenantSummaryOut
    adminUserId: int
    adminEmail: str
    adminRole: str
    userCreated: bool
    membershipCreated: bool
    testChildCreated: bool
