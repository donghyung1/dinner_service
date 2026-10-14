from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_recommendation_service
from app.models import Category, RestaurantStatus
from app.schemas.restaurant import CandidatesOut, RecommendationOut, SkipCreate, SkipOut
from app.schemas.types import PriceLevelList
from app.services.recommendation_service import RecommendationService

router = APIRouter(prefix="/recommendations", tags=["recommendations"])
Svc = Annotated[RecommendationService, Depends(get_recommendation_service)]


def _clean(v: str | None) -> str | None:
    v = (v or "").strip()
    return v or None


@router.get("/random", response_model=RecommendationOut)
def random_recommendation(
    svc: Svc,
    category: Annotated[list[Category] | None, Query()] = None,
    price_level: Annotated[PriceLevelList | None, Query()] = None,
    status: RestaurantStatus | None = None,
    is_favorite: bool | None = None,
    exclude_recent_days: Annotated[int, Query(ge=0, le=90)] = 7,
    exclude_id: Annotated[int | None, Query(ge=1)] = None,
    exclude_place_no: Annotated[str | None, Query(max_length=30)] = None,
    sigungu: Annotated[str | None, Query(max_length=30)] = None,
    dong: Annotated[str | None, Query(max_length=30)] = None,
    weighted: bool = True,
    stale_wishlist: bool = False,
):
    return svc.random(
        categories=category,
        price_levels=price_level,
        status=status,
        is_favorite=is_favorite,
        exclude_recent_days=exclude_recent_days,
        exclude_id=exclude_id,
        exclude_place_no=exclude_place_no,
        sigungu=_clean(sigungu),
        dong=_clean(dong),
        weighted=weighted,
        stale_wishlist=stale_wishlist,
    )


@router.get("/candidates", response_model=CandidatesOut)
def candidate_recommendations(
    svc: Svc,
    category: Annotated[list[Category] | None, Query()] = None,
    price_level: Annotated[PriceLevelList | None, Query()] = None,
    status: RestaurantStatus | None = None,
    is_favorite: bool | None = None,
    exclude_recent_days: Annotated[int, Query(ge=0, le=90)] = 7,
    count: Annotated[int, Query(ge=1, le=8)] = 4,
    sigungu: Annotated[str | None, Query(max_length=30)] = None,
    dong: Annotated[str | None, Query(max_length=30)] = None,
    weighted: bool = True,
    stale_wishlist: bool = False,
):
    return svc.candidates(
        categories=category,
        price_levels=price_level,
        status=status,
        is_favorite=is_favorite,
        exclude_recent_days=exclude_recent_days,
        count=count,
        sigungu=_clean(sigungu),
        dong=_clean(dong),
        weighted=weighted,
        stale_wishlist=stale_wishlist,
    )


@router.post("/skips", response_model=SkipOut, status_code=201)
def record_skip(body: SkipCreate, svc: Svc):
    return svc.record_skip(body.restaurant_id)
