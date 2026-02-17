from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


ThemeName = Literal["default", "space", "jungle", "ocean", "soccer", "capybara", "dinos", "princess", "heroes"]


class ChildThemeUpdateRequest(BaseModel):
    theme: ThemeName


class ChildThemeResponse(BaseModel):
    child_id: int
    theme: ThemeName
