import random

from app.core.errors import NotFoundError
from app.repositories.place_repo import PlaceRepository
from app.repositories.restaurant_repo import RestaurantRepository
from app.schemas.search import MineItem, PlaceItem, RestaurantSearchOut, SearchItem
from app.services.place_service import place_out
from app.services.restaurant_service import restaurant_out
from app.services.restaurant_view import expiring_cutoff


class RestaurantSearchService:
    """내 식당 + 공공데이터 식당 통합 목록(PRD 5.12). 내 식당이 먼저, 이어서 카탈로그 식당."""

    def __init__(self, restaurants: RestaurantRepository, places: PlaceRepository):
        self.restaurants = restaurants
        self.places = places

    @staticmethod
    def _place_included(*, q, categories, sigungu, dong, status, price_levels, is_favorite, mine_only) -> bool:
        """카탈로그는 키워드·카테고리·지역 중 하나라도 있을 때만, 내 식당 전용 속성 필터가 없을 때만 포함한다."""
        if mine_only or status is not None or price_levels or is_favorite is not None:
            return False
        return bool(q or categories or sigungu or dong)

    def _filters(self, *, q, categories, sigungu, dong, status, price_levels, is_favorite, mine_only):
        mine = dict(
            q=q, categories=categories, price_levels=price_levels, status=status,
            is_favorite=is_favorite, sigungu=sigungu, dong=dong,
        )
        place = None
        if self._place_included(
            q=q, categories=categories, sigungu=sigungu, dong=dong, status=status,
            price_levels=price_levels, is_favorite=is_favorite, mine_only=mine_only,
        ):
            # 이미 내 식당에 연결된 곳은 중복이므로 제외한다.
            place = dict(sigungu=sigungu, dong=dong, categories=categories, q=q, exclude_registered=True)
        return mine, place

    def _mine_items(self, mine, sort, offset, limit) -> list[SearchItem]:
        rows, _ = self.restaurants.list(sort=sort, limit=limit, offset=offset, **mine)
        cutoff = expiring_cutoff()
        return [MineItem(**restaurant_out(r, cutoff).model_dump()) for r in rows]

    def _place_items(self, place, offset, limit) -> list[SearchItem]:
        rows = self.places.page(offset=offset, limit=limit, **place)
        return [PlaceItem(**place_out(p, False).model_dump()) for p in rows]

    def search(self, *, sort, offset: int, limit: int, **cond) -> RestaurantSearchOut:
        mine, place = self._filters(**cond)
        mine_total = self.restaurants.count(**mine)
        place_total = self.places.count(**place) if place else 0
        items: list[SearchItem] = []
        if offset < mine_total:
            items = self._mine_items(mine, sort, offset, limit)
        if place and len(items) < limit:
            items += self._place_items(place, max(0, offset - mine_total), limit - len(items))
        return RestaurantSearchOut(
            items=items, total=mine_total + place_total, mine_total=mine_total,
            place_total=place_total, limit=limit, offset=offset,
        )

    def random(self, *, sort, **cond) -> SearchItem:
        """합쳐진 후보 전체에서 균일 무작위 1건. 인덱스를 뽑아 해당 쪽에서 offset 조회한다."""
        mine, place = self._filters(**cond)
        mine_total = self.restaurants.count(**mine)
        place_total = self.places.count(**place) if place else 0
        total = mine_total + place_total
        if total == 0:
            raise NotFoundError("조건에 맞는 식당이 없습니다.")
        i = random.randrange(total)
        items = self._mine_items(mine, sort, i, 1) if i < mine_total else self._place_items(place, i - mine_total, 1)
        if not items:  # 조회 사이에 데이터가 바뀐 경우
            raise NotFoundError("조건에 맞는 식당이 없습니다.")
        return items[0]
