from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_recommendation_service
from app.models import Category, RestaurantStatus
from app.schemas.restaurant import RecommendationOut
from app.schemas.types import PriceLevelList
from app.services.recommendation_service import RecommendationService

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("/random", response_model=RecommendationOut)
def random_recommendation(
    svc: Annotated[RecommendationService, Depends(get_recommendation_service)],
    category: Annotated[list[Category] | None, Query()] = None,
    price_level: Annotated[PriceLevelList | None, Query()] = None,
    status: RestaurantStatus | None = None,
    is_favorite: bool | None = None,
    exclude_recent_days: Annotated[int, Query(ge=0, le=90)] = 7,
    exclude_id: Annotated[int | None, Query(ge=1)] = None,
):
    return svc.random(
        categories=category,
        price_levels=price_level,
        status=status,
        is_favorite=is_favorite,
        exclude_recent_days=exclude_recent_days,
        exclude_id=exclude_id,
    )
