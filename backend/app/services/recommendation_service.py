import random
from datetime import date

from app.core.errors import NoCandidatesError
from app.repositories.restaurant_repo import RestaurantRepository
from app.schemas.restaurant import RecommendationOut, RecommendedRestaurant


def pick_random(candidates: list, exclude_id: int | None):
    """후보에서 균등 확률로 1건 선택. 후보가 2개 이상일 때만 exclude_id를 제외한다."""
    pool = candidates
    if exclude_id is not None and len(candidates) > 1:
        pool = [c for c in candidates if c[0].id != exclude_id] or candidates
    return random.choice(pool), len(pool)


class RecommendationService:
    def __init__(self, repo: RestaurantRepository):
        self.repo = repo

    def random(
        self,
        *,
        categories=None,
        price_levels=None,
        status=None,
        is_favorite: bool | None = None,
        exclude_recent_days: int = 7,
        exclude_id: int | None = None,
    ) -> RecommendationOut:
        candidates = self.repo.candidates(
            today=date.today(),
            exclude_recent_days=exclude_recent_days,
            categories=categories,
            price_levels=price_levels,
            status=status,
            is_favorite=is_favorite,
        )
        if not candidates:
            raise NoCandidatesError(
                "조건에 맞는 식당이 없습니다. 카테고리·가격대 조건이나 최근 방문 제외 기간을 완화해 보세요."
            )
        (r, last), count = pick_random(candidates, exclude_id)
        data = RecommendedRestaurant(
            id=r.id,
            name=r.name,
            category=r.category,
            status=r.status,
            price_level=r.price_level,
            location=r.location,
            memo=r.memo,
            is_favorite=r.is_favorite,
            last_visited_on=last,
        )
        return RecommendationOut(restaurant=data, candidate_count=count)
