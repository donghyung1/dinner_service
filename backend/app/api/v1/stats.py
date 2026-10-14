from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_stats_service
from app.schemas.stats import CategoryGapOut, MonthlyStatsOut
from app.services.stats_service import StatsService

router = APIRouter(prefix="/stats", tags=["stats"])
Svc = Annotated[StatsService, Depends(get_stats_service)]


@router.get("/category-gap", response_model=CategoryGapOut)
def category_gap(svc: Svc):
    return svc.category_gap()


@router.get("/monthly", response_model=MonthlyStatsOut)
def monthly(svc: Svc, month: Annotated[str | None, Query(max_length=7)] = None):
    return svc.monthly(month)
