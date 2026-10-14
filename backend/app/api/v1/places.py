from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_place_service
from app.core.errors import UnprocessableError
from app.models import Category
from app.schemas.place import PlaceList
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
