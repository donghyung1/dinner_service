from datetime import date

from app.core.errors import NotFoundError
from app.models import Visit
from app.repositories.restaurant_repo import RestaurantRepository
from app.repositories.visit_repo import VisitRepository
from app.schemas.visit import VisitCreate, VisitList, VisitOut


class VisitService:
    def __init__(self, visits: VisitRepository, restaurants: RestaurantRepository):
        self.visits = visits
        self.restaurants = restaurants

    def create(self, data: VisitCreate) -> VisitOut:
        if self.restaurants.get(data.restaurant_id) is None:
            raise NotFoundError("식당을 찾을 수 없습니다.")
        v = Visit(
            restaurant_id=data.restaurant_id,
            visited_on=data.visited_on or date.today(),
            source=data.source,
            note=data.note,
        )
        return VisitOut.model_validate(self.visits.add(v))

    def list(self, *, restaurant_id, date_from, date_to, limit, offset) -> VisitList:
        items, total = self.visits.list(
            restaurant_id=restaurant_id, date_from=date_from, date_to=date_to, limit=limit, offset=offset
        )
        return VisitList(
            items=[VisitOut.model_validate(v) for v in items], total=total, limit=limit, offset=offset
        )

    def delete(self, visit_id: int) -> None:
        v = self.visits.get(visit_id)
        if v is None:
            raise NotFoundError("방문 기록을 찾을 수 없습니다.")
        self.visits.delete(v)
