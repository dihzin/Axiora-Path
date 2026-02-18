from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


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


class ChildUpdateRequest(BaseModel):
    display_name: str
    birth_year: int | None = None
    theme: ThemeName


class ChildOut(BaseModel):
    id: int
    display_name: str
    avatar_key: str | None
    birth_year: int | None
    theme: ThemeName
    avatar_stage: int
