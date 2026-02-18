from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class StoreItemOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    name: str
    type: str
    price: int
    rarity: str
    image_url: str | None = Field(alias="imageUrl")
    owned: bool
    equipped: bool


class StoreCatalogResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    coins: int
    items: list[StoreItemOut]


class StorePurchaseRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    item_id: int = Field(alias="itemId")


class StoreEquipRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    item_id: int = Field(alias="itemId")


class StorePurchaseResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool
    coins: int
    item_id: int = Field(alias="itemId")

