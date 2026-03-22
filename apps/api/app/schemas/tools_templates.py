from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ToolTemplateCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    config: dict[str, Any]
    blocks: list[Any]
    is_public: bool = False


class ToolTemplateOut(BaseModel):
    id: str
    user_id: int
    name: str
    config: dict[str, Any]
    blocks: list[Any]
    is_public: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ToolTemplateDuplicateOut(ToolTemplateOut):
    pass
