from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_place_service
from app.core.errors import UnprocessableError
from app.models import Category
from app.schemas.place import PlaceBrowse, PlaceList, PlaceOut, RegionList
from app.services.place_service import PlaceService

router = APIRouter(prefix="/places", tags=["places"])


@router.get("", response_model=PlaceList)
def search_places(
    svc: Annotated[PlaceService, Depends(get_place_service)],
    q: Annotated[str, Query(min_length=2, max_length=50)],
    category: Annotated[list[Category] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
):
    q = q.strip()
    if len(q) < 2:
        raise UnprocessableError("검색어는 공백을 제외하고 2자 이상이어야 합니다.")
    return svc.search(q=q, categories=category, limit=limit)


def _clean(v: str | None) -> str | None:
    v = (v or "").strip()
    return v or None


# 고정 경로는 위 "" 검색과 겹치지 않는다(/places/regions 등).
@router.get("/regions", response_model=RegionList)
def list_regions(
    svc: Annotated[PlaceService, Depends(get_place_service)],
    sigungu: Annotated[str | None, Query(max_length=30)] = None,
):
    return svc.regions(sigungu=_clean(sigungu))


@router.get("/browse", response_model=PlaceBrowse)
def browse_places(
    svc: Annotated[PlaceService, Depends(get_place_service)],
    sigungu: Annotated[str | None, Query(max_length=30)] = None,
    dong: Annotated[str | None, Query(max_length=30)] = None,
    category: Annotated[list[Category] | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=50)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
):
    return svc.browse(
        sigungu=_clean(sigungu), dong=_clean(dong), categories=category, q=_clean(q), offset=offset, limit=limit
    )


@router.get("/random", response_model=PlaceOut)
def random_place(
    svc: Annotated[PlaceService, Depends(get_place_service)],
    sigungu: Annotated[str | None, Query(max_length=30)] = None,
    dong: Annotated[str | None, Query(max_length=30)] = None,
    category: Annotated[list[Category] | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=50)] = None,
    exclude_registered: bool = True,
):
    return svc.random(
        sigungu=_clean(sigungu), dong=_clean(dong), categories=category, q=_clean(q),
        exclude_registered=exclude_registered,
    )
