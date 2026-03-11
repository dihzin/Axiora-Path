from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class StudentProfileCreate(BaseModel):
    name: str
    birth_date: date
    child_profile_id: int | None = None


class SchoolTeacherCreateRequest(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=10)


class SchoolStudentCreateRequest(StudentProfileCreate):
    pass


class SchoolStudentFamilyLinkRequest(BaseModel):
    child_profile_id: int


class SchoolStudentFamilyLinkAcceptRequest(BaseModel):
    token: str


class SchoolEnableStudentLoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=10)
    name: str | None = None


class StudentFamilyLinkResponse(BaseModel):
    student_profile_id: int
    child_profile_id: int
    status: Literal["pending", "accepted", "expired", "rejected"]


class FamilyLinkRequestResponse(StudentFamilyLinkResponse):
    token: str
    expires_at: datetime
    confirmation_link: str | None = None


class SchoolStudentFamilyLinkStatusOut(FamilyLinkRequestResponse):
    pass


class SchoolMemberOut(BaseModel):
    user_id: int
    name: str
    email: str
    role: str


class TeacherResponse(BaseModel):
    id: int
    name: str
    email: str


class SchoolTeacherListItemOut(TeacherResponse):
    created_at: datetime


class SchoolTeacherStudentListItemOut(BaseModel):
    id: int
    name: str
    birth_date: date
    child_profile_id: int | None
    login_enabled: bool


class StudentProfileResponse(BaseModel):
    id: int
    organization_id: int
    name: str
    birth_date: date
    child_profile_id: int | None
    user_id: int | None
    created_at: datetime


class SchoolStudentProfileOut(StudentProfileResponse):
    family_link_exists: bool
