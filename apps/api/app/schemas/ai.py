from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CoachRequest(BaseModel):
    child_id: int
    mode: Literal["CHILD", "PARENT"]
    message: str | None = None


class CoachResponse(BaseModel):
    reply: str
    suggested_actions: list[str]
    tone: str

