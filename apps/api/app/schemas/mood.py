from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel


class MoodCreateRequest(BaseModel):
    child_id: int
    mood: Literal["HAPPY", "OK", "SAD", "ANGRY", "TIRED"]
    date: date | None = None


class MoodOut(BaseModel):
    child_id: int
    date: date
    mood: str

