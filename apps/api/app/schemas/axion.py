from __future__ import annotations

from pydantic import BaseModel


class AxionStateResponse(BaseModel):
    stage: int
    mood_state: str
    personality_traits: list[str]
