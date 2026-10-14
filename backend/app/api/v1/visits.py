from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_visit_service
from app.schemas.visit import VisitCreate, VisitList, VisitOut
from app.services.visit_service import VisitService

router = APIRouter(prefix="/visits", tags=["visits"])
Svc = Annotated[VisitService, Depends(get_visit_service)]


@router.post("", response_model=VisitOut, status_code=201)
def create_visit(body: VisitCreate, svc: Svc):
    return svc.create(body)


@router.get("", response_model=VisitList)
def list_visits(
    svc: Svc,
    restaurant_id: Annotated[int | None, Query(ge=1)] = None,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return svc.list(restaurant_id=restaurant_id, date_from=from_, date_to=to, limit=limit, offset=offset)


@router.delete("/{visit_id}", status_code=204)
def delete_visit(visit_id: int, svc: Svc):
    svc.delete(visit_id)
    return Response(status_code=204)
