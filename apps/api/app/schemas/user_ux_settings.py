from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserUXSettingsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    user_id: int = Field(alias="userId")
    sound_enabled: bool = Field(alias="soundEnabled")
    haptics_enabled: bool = Field(alias="hapticsEnabled")
    reduced_motion: bool = Field(alias="reducedMotion")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class UserUXSettingsUpsertRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sound_enabled: bool = Field(default=True, alias="soundEnabled")
    haptics_enabled: bool = Field(default=True, alias="hapticsEnabled")
    reduced_motion: bool = Field(default=False, alias="reducedMotion")
