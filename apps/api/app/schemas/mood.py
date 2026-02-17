from __future__ import annotations

from datetime import date as DateType
from typing import Literal

from pydantic import BaseModel


class MoodCreateRequest(BaseModel):
    child_id: int
    mood: Literal["HAPPY", "OK", "SAD", "ANGRY", "TIRED"]
    date: DateType | None = None


class MoodOut(BaseModel):
    child_id: int
    date: DateType
    mood: str
