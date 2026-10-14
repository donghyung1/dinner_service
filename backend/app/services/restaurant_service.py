from sqlalchemy import func

from app.core.errors import NotFoundError
from app.models import Restaurant
from app.repositories.restaurant_repo import RestaurantRepository, RestaurantRow
from app.repositories.visit_repo import VisitRepository
from app.schemas.restaurant import (
    RestaurantCreate,
    RestaurantDetail,
    RestaurantList,
    RestaurantOut,
    RestaurantUpdate,
)
from app.schemas.visit import VisitOut
from app.services.restaurant_view import derived_fields, expiring_cutoff


def _out(row: RestaurantRow, cutoff) -> RestaurantOut:
    o = RestaurantOut.model_validate(row.restaurant)
    for k, v in derived_fields(row, cutoff).items():
        setattr(o, k, v)
    return o


class RestaurantService:
    def __init__(self, repo: RestaurantRepository, visits: VisitRepository):
        self.repo = repo
        self.visits = visits

    def _get_or_404(self, restaurant_id: int) -> Restaurant:
        r = self.repo.get(restaurant_id)
        if r is None:
            raise NotFoundError("식당을 찾을 수 없습니다.")
        return r

    def _view(self, restaurant_id: int) -> RestaurantOut:
        return _out(self.repo.get_row(restaurant_id), expiring_cutoff())

    def create(self, data: RestaurantCreate) -> RestaurantOut:
        r = self.repo.add(Restaurant(**data.model_dump()))
        return self._view(r.id)

    def list(self, *, sort, limit: int, offset: int, **filters) -> RestaurantList:
        rows, total = self.repo.list(sort=sort, limit=limit, offset=offset, **filters)
        cutoff = expiring_cutoff()
        return RestaurantList(items=[_out(row, cutoff) for row in rows], total=total, limit=limit, offset=offset)

    def detail(self, restaurant_id: int) -> RestaurantDetail:
        self._get_or_404(restaurant_id)
        base = self._view(restaurant_id)
        recent = [VisitOut.model_validate(v) for v in self.visits.recent_for_restaurant(restaurant_id)]
        return RestaurantDetail(**base.model_dump(), recent_visits=recent)

    def update(self, restaurant_id: int, data: RestaurantUpdate) -> RestaurantOut:
        r = self._get_or_404(restaurant_id)
        values = data.model_dump()
        if "place_no" not in data.model_fields_set:
            values.pop("place_no")  # 생략 시 기존 연결 유지
        for k, v in values.items():
            setattr(r, k, v)
        self.repo.save(r)
        return self._view(restaurant_id)

    def set_favorite(self, restaurant_id: int, is_favorite: bool) -> RestaurantOut:
        r = self._get_or_404(restaurant_id)
        r.is_favorite = is_favorite
        self.repo.save(r)
        return self._view(restaurant_id)

    def delete(self, restaurant_id: int) -> None:
        self.repo.delete(self._get_or_404(restaurant_id))

    def dismiss_skip_suggestion(self, restaurant_id: int) -> None:
        r = self._get_or_404(restaurant_id)
        r.skip_dismissed_at = func.now()
        self.repo.save(r)
