from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.models import Membership, StoreItem, Tenant, User, UserInventory
from app.schemas.store import (
    StoreCatalogResponse,
    StoreEquipRequest,
    StoreItemOut,
    StorePurchaseRequest,
    StorePurchaseResponse,
)
from app.services.gamification import get_or_create_game_profile

router = APIRouter(prefix="/api/store", tags=["store"])


def _build_catalog(db: DBSession, *, user_id: int) -> StoreCatalogResponse:
    profile = get_or_create_game_profile(db, user_id=user_id)
    items = db.scalars(select(StoreItem).order_by(StoreItem.price.asc(), StoreItem.id.asc())).all()
    inventory_rows = db.scalars(select(UserInventory).where(UserInventory.user_id == user_id)).all()
    inventory_by_item = {row.item_id: row for row in inventory_rows}
    return StoreCatalogResponse(
        coins=profile.axion_coins,
        items=[
            StoreItemOut(
                id=item.id,
                name=item.name,
                type=item.type,
                price=item.price,
                rarity=item.rarity,
                imageUrl=item.image_url,
                owned=item.id in inventory_by_item,
                equipped=inventory_by_item[item.id].equipped
                if item.id in inventory_by_item
                else False,
            )
            for item in items
        ],
    )


@router.get("/items", response_model=StoreCatalogResponse)
def list_store_items(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> StoreCatalogResponse:
    return _build_catalog(db, user_id=user.id)


@router.post("/purchase", response_model=StorePurchaseResponse, status_code=status.HTTP_201_CREATED)
def purchase_store_item(
    payload: StorePurchaseRequest,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> StorePurchaseResponse:
    item = db.scalar(select(StoreItem).where(StoreItem.id == payload.item_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    existing = db.scalar(
        select(UserInventory).where(
            UserInventory.user_id == user.id,
            UserInventory.item_id == item.id,
        ),
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Item already owned")

    profile = get_or_create_game_profile(db, user_id=user.id)
    if profile.axion_coins < item.price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient AxionCoins",
        )

    profile.axion_coins -= item.price
    db.add(UserInventory(user_id=user.id, item_id=item.id, equipped=False))
    db.commit()
    return StorePurchaseResponse(success=True, coins=profile.axion_coins, itemId=item.id)


@router.post("/equip", response_model=StorePurchaseResponse)
def equip_store_item(
    payload: StoreEquipRequest,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> StorePurchaseResponse:
    item = db.scalar(select(StoreItem).where(StoreItem.id == payload.item_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    owned = db.scalar(
        select(UserInventory).where(
            UserInventory.user_id == user.id,
            UserInventory.item_id == item.id,
        ),
    )
    if owned is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Item is not owned")

    same_type_item_ids = db.scalars(select(StoreItem.id).where(StoreItem.type == item.type)).all()
    if same_type_item_ids:
        db.execute(
            UserInventory.__table__.update()
            .where(
                UserInventory.user_id == user.id,
                UserInventory.item_id.in_(same_type_item_ids),
            )
            .values(equipped=False),
        )
    owned.equipped = True

    profile = get_or_create_game_profile(db, user_id=user.id)
    db.commit()
    return StorePurchaseResponse(success=True, coins=profile.axion_coins, itemId=item.id)
