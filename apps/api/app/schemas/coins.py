from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CoinConvertRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    coins: int = Field(gt=0)


class ParentApproveConversionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    conversion_id: str = Field(alias="conversionId")


class CoinConversionOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: int = Field(alias="userId")
    coins_used: int = Field(alias="coinsUsed")
    amount_generated: int = Field(alias="amountGenerated")
    approved: bool
    approved_at: datetime | None = Field(alias="approvedAt")
    created_at: datetime = Field(alias="createdAt")


class CoinConvertRequestResponse(BaseModel):
    conversion: CoinConversionOut
    conversion_rate: str = Field(alias="conversionRate")
    profile_coins_after_request: int = Field(alias="profileCoinsAfterRequest")


class ParentApproveConversionResponse(BaseModel):
    conversion: CoinConversionOut | None = None
    approved: bool
    profile_coins: int = Field(alias="profileCoins")
