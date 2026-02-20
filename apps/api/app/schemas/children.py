from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


ThemeName = Literal["default", "space", "jungle", "ocean", "soccer", "capybara", "dinos", "princess", "heroes"]


class ChildThemeUpdateRequest(BaseModel):
    theme: ThemeName


class ChildThemeResponse(BaseModel):
    child_id: int
    theme: ThemeName


class ChildCreateRequest(BaseModel):
    display_name: str
    birth_year: int | None = None
    theme: ThemeName = "default"
    avatar_key: str | None = None


class ChildUpdateRequest(BaseModel):
    display_name: str
    birth_year: int | None = None
    theme: ThemeName
    avatar_key: str | None = None


class ChildOut(BaseModel):
    id: int
    display_name: str
    avatar_key: str | None
    birth_year: int | None
    theme: ThemeName
    avatar_stage: int


class ChildDeleteRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=12)
