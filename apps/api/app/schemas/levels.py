from __future__ import annotations

from pydantic import BaseModel


class LevelResponse(BaseModel):
    child_id: int
    xp_total: int
    level: int
    level_progress_percent: float
    xp_current_level_start: int
    xp_next_level_target: int

