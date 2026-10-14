from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_restaurant_service
from app.models import Category, RestaurantSort, RestaurantStatus
from app.schemas.restaurant import (
    FavoriteUpdate,
    RestaurantCreate,
    RestaurantDetail,
    RestaurantList,
    RestaurantOut,
    RestaurantUpdate,
)
from app.schemas.types import PriceLevelList
from app.services.restaurant_service import RestaurantService

router = APIRouter(prefix="/restaurants", tags=["restaurants"])
Svc = Annotated[RestaurantService, Depends(get_restaurant_service)]


@router.get("", response_model=RestaurantList)
def list_restaurants(
    svc: Svc,
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[list[Category] | None, Query()] = None,
    price_level: Annotated[PriceLevelList | None, Query()] = None,
    status: RestaurantStatus | None = None,
    is_favorite: bool | None = None,
    sort: RestaurantSort = RestaurantSort.CREATED_DESC,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return svc.list(
        q=q.strip() if q else None,
        categories=category,
        price_levels=price_level,
        status=status,
        is_favorite=is_favorite,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=RestaurantOut, status_code=201)
def create_restaurant(body: RestaurantCreate, svc: Svc):
    return svc.create(body)


@router.get("/{restaurant_id}", response_model=RestaurantDetail)
def get_restaurant(restaurant_id: int, svc: Svc):
    return svc.detail(restaurant_id)


@router.put("/{restaurant_id}", response_model=RestaurantOut)
def update_restaurant(restaurant_id: int, body: RestaurantUpdate, svc: Svc):
    return svc.update(restaurant_id, body)


@router.delete("/{restaurant_id}", status_code=204)
def delete_restaurant(restaurant_id: int, svc: Svc):
    svc.delete(restaurant_id)
    return Response(status_code=204)


@router.patch("/{restaurant_id}/favorite", response_model=RestaurantOut)
def set_favorite(restaurant_id: int, body: FavoriteUpdate, svc: Svc):
    return svc.set_favorite(restaurant_id, body.is_favorite)


@router.post("/{restaurant_id}/skip-suggestion/dismiss", status_code=204)
def dismiss_skip_suggestion(restaurant_id: int, svc: Svc):
    svc.dismiss_skip_suggestion(restaurant_id)
    return Response(status_code=204)
