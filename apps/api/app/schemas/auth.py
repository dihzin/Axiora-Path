from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SignupRequest(BaseModel):
    email: str
    name: str
    password: str = Field(min_length=8)
    tenant_name: str
    tenant_slug: str


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class AuthTokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime


class MembershipOut(BaseModel):
    role: str
    tenant_id: int
    tenant_slug: str


class ChildProfileOut(BaseModel):
    id: int
    display_name: str
    avatar_key: str | None
    birth_year: int | None


class MeResponse(BaseModel):
    user: UserOut
    membership: MembershipOut
    child_profiles: list[ChildProfileOut]


class MessageResponse(BaseModel):
    message: str

