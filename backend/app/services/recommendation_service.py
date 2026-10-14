import random
from datetime import date

from app.core.errors import NoCandidatesError, NotFoundError
from app.models import RestaurantStatus
from app.repositories.restaurant_repo import RestaurantRepository, RestaurantRow
from app.repositories.skip_repo import SkipRepository
from app.schemas.restaurant import CandidatesOut, RecommendationOut, RecommendedRestaurant, SkipOut
from app.services.restaurant_view import derived_fields, expiring_cutoff

# 가중치 상수 (PRD 5.4.1). 환경변수로 노출하지 않는다.
ELAPSED_CAP_DAYS = 60
ELAPSED_DIVISOR = 30
WISHLIST_BONUS = 2.0
FAVORITE_BONUS = 1.2
SKIP_PENALTY_STEP = 0.1
SKIP_PENALTY_FLOOR = 0.5

NO_CANDIDATES_MESSAGE = "조건에 맞는 식당이 없습니다. 카테고리·가격대 조건이나 최근 방문 제외 기간을 완화해 보세요."


def weight_of(row: RestaurantRow, today: date) -> float:
    r = row.restaurant
    if row.last_visited_on is not None:
        days = max(0, (today - row.last_visited_on).days)
        elapsed = 1 + min(days, ELAPSED_CAP_DAYS) / ELAPSED_DIVISOR
    else:
        elapsed = 1.0
    wishlist = WISHLIST_BONUS if r.status == RestaurantStatus.WISHLIST and row.visit_count == 0 else 1.0
    favorite = FAVORITE_BONUS if r.is_favorite else 1.0
    penalty = max(SKIP_PENALTY_FLOOR, 1 - SKIP_PENALTY_STEP * row.consecutive_skips)
    return elapsed * wishlist * favorite * penalty


def _pick_one(pool: list[RestaurantRow], weighted: bool, today: date) -> RestaurantRow:
    if not weighted:
        return random.choice(pool)
    return random.choices(pool, weights=[weight_of(c, today) for c in pool], k=1)[0]


def _pick_many(pool: list[RestaurantRow], k: int, weighted: bool, today: date) -> list[RestaurantRow]:
    """비복원 추출. 가중치는 뽑을 때마다 남은 후보 기준으로 다시 정규화된다."""
    rest = list(pool)
    out: list[RestaurantRow] = []
    while rest and len(out) < k:
        c = _pick_one(rest, weighted, today)
        out.append(c)
        rest.remove(c)
    return out


class RecommendationService:
    def __init__(self, repo: RestaurantRepository, skips: SkipRepository):
        self.repo = repo
        self.skips = skips

    def _candidates(
        self, *, categories, price_levels, status, is_favorite, exclude_recent_days, stale_wishlist, today: date
    ) -> list[RestaurantRow]:
        candidates = self.repo.candidates(
            today=today,
            exclude_recent_days=exclude_recent_days,
            categories=categories,
            price_levels=price_levels,
            status=status,
            is_favorite=is_favorite,
            expiring_before=expiring_cutoff() if stale_wishlist else None,
        )
        if not candidates:
            raise NoCandidatesError(NO_CANDIDATES_MESSAGE)
        return candidates

    @staticmethod
    def _view(row: RestaurantRow, cutoff) -> RecommendedRestaurant:
        r = row.restaurant
        return RecommendedRestaurant(
            id=r.id,
            name=r.name,
            category=r.category,
            status=r.status,
            price_level=r.price_level,
            location=r.location,
            memo=r.memo,
            is_favorite=r.is_favorite,
            **derived_fields(row, cutoff),
        )

    def random(
        self,
        *,
        categories=None,
        price_levels=None,
        status=None,
        is_favorite: bool | None = None,
        exclude_recent_days: int = 7,
        exclude_id: int | None = None,
        weighted: bool = True,
        stale_wishlist: bool = False,
    ) -> RecommendationOut:
        today = date.today()
        pool = self._candidates(
            categories=categories,
            price_levels=price_levels,
            status=status,
            is_favorite=is_favorite,
            exclude_recent_days=exclude_recent_days,
            stale_wishlist=stale_wishlist,
            today=today,
        )
        # exclude_id는 후보가 2곳 이상일 때만 제외한다.
        if exclude_id is not None and len(pool) > 1:
            pool = [c for c in pool if c.restaurant.id != exclude_id] or pool
        picked = _pick_one(pool, weighted, today)
        return RecommendationOut(restaurant=self._view(picked, expiring_cutoff()), candidate_count=len(pool))

    def candidates(
        self,
        *,
        categories=None,
        price_levels=None,
        status=None,
        is_favorite: bool | None = None,
        exclude_recent_days: int = 7,
        count: int = 4,
        weighted: bool = True,
        stale_wishlist: bool = False,
    ) -> CandidatesOut:
        today = date.today()
        pool = self._candidates(
            categories=categories,
            price_levels=price_levels,
            status=status,
            is_favorite=is_favorite,
            exclude_recent_days=exclude_recent_days,
            stale_wishlist=stale_wishlist,
            today=today,
        )
        cutoff = expiring_cutoff()
        picked = _pick_many(pool, count, weighted, today)
        return CandidatesOut(restaurants=[self._view(c, cutoff) for c in picked], candidate_count=len(pool))

    def record_skip(self, restaurant_id: int) -> SkipOut:
        if self.repo.get(restaurant_id) is None:
            raise NotFoundError("식당을 찾을 수 없습니다.")
        s = self.skips.add(restaurant_id)
        return SkipOut(id=s.id, restaurant_id=s.restaurant_id, skipped_at=s.skipped_at)
