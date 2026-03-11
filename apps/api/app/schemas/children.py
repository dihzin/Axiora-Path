from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


ThemeName = Literal["default", "space", "jungle", "ocean", "soccer", "capybara", "dinos", "princess", "heroes"]
MIN_CHILD_AGE = 4
MAX_CHILD_AGE = 18


def _years_between(today: date, birth_date: date) -> int:
    years = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        years -= 1
    return years


def _validate_child_age(value: date) -> date:
    today = date.today()
    age = _years_between(today, value)
    if age < MIN_CHILD_AGE or age > MAX_CHILD_AGE:
        raise ValueError(f"child age must be between {MIN_CHILD_AGE} and {MAX_CHILD_AGE}")
    return value


class ChildThemeUpdateRequest(BaseModel):
    theme: ThemeName


class ChildThemeResponse(BaseModel):
    child_id: int
    theme: ThemeName


class ChildCreateRequest(BaseModel):
    display_name: str
    date_of_birth: date
    theme: ThemeName = "default"
    avatar_key: str | None = None

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date) -> date:
        return _validate_child_age(value)


class ChildUpdateRequest(BaseModel):
    display_name: str
    date_of_birth: date
    theme: ThemeName
    avatar_key: str | None = None

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date) -> date:
        return _validate_child_age(value)


class FamilyChildCreateRequest(BaseModel):
    name: str
    birth_date: date

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, value: date) -> date:
        return _validate_child_age(value)


class ChildGuardianOut(BaseModel):
    user_id: int
    name: str
    email: str
    relationship: str


class FamilyChildOut(BaseModel):
    id: int
    name: str
    birth_date: date
    guardians: list[ChildGuardianOut]


class FamilyGuardianInviteRequest(BaseModel):
    email: str
    relationship: str = Field(min_length=2, max_length=32)


class FamilyGuardianInviteResponse(BaseModel):
    message: str
    invite_token: str
    invite_link: str
    expires_at: datetime


class FamilyGuardianAcceptInviteRequest(BaseModel):
    token: str
    name: str | None = None
    password: str | None = Field(default=None, min_length=10)


class FamilyGuardianAcceptInviteResponse(BaseModel):
    message: str
    tenant_slug: str
    linked_children_count: int


class FamilyEnableChildLoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=10)
    name: str | None = None


class FamilyEnableChildLoginResponse(BaseModel):
    child_id: int
    user_id: int
    email: str
    name: str


class ChildOut(BaseModel):
    id: int
    display_name: str
    avatar_key: str | None
    date_of_birth: date
    birth_year: int | None
    needs_profile_completion: bool
    theme: ThemeName
    avatar_stage: int


class ChildDeleteRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=12)
