from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class SignupRequest(BaseModel):
    email: str
    name: str
    password: str = Field(min_length=10)
    tenant_type: Literal["FAMILY"] = "FAMILY"
    tenant_name: str
    tenant_slug: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(min_length=20)


class SelectTenantRequest(BaseModel):
    tenant_slug: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10)


class ResetPasswordByEmailRequest(BaseModel):
    email: str
    new_password: str = Field(min_length=10)


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class AuthTokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class PrimaryLoginMembershipOut(BaseModel):
    tenant_id: int
    tenant_slug: str
    tenant_name: str
    tenant_type: str
    role: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime


class MembershipOut(BaseModel):
    role: str
    tenant_id: int
    tenant_slug: str
    tenant_type: str
    onboarding_completed: bool


class OrganizationMembershipOut(BaseModel):
    role: str
    tenant_id: int
    tenant_name: str
    tenant_slug: str
    tenant_type: str
    onboarding_completed: bool


class ChildProfileOut(BaseModel):
    id: int
    display_name: str
    avatar_key: str | None
    date_of_birth: date
    birth_year: int | None
    needs_profile_completion: bool
    theme: str
    avatar_stage: int


class MeResponse(BaseModel):
    user: UserOut
    membership: MembershipOut
    child_profiles: list[ChildProfileOut]


class PrimaryLoginResponse(BaseModel):
    access_token: str
    user: UserOut
    memberships: list[PrimaryLoginMembershipOut]


class SelectTenantResponse(BaseModel):
    access_token: str
    tenant_slug: str
    role: str


class MessageResponse(BaseModel):
    message: str
