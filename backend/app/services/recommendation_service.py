import random
from dataclasses import dataclass
from datetime import date

from app.core.errors import NoCandidatesError, NotFoundError
from app.core.region import dong_group, dong_stem
from app.models import Place, RestaurantStatus
from app.repositories.place_repo import PlaceRepository
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

# 내 위치 추천(PRD 5.13): 공공데이터 식당은 방문·넘김 기록이 없으므로 가중치 1.0(보너스·감점 없는 기본값)으로 둔다.
PLACE_WEIGHT = 1.0
# places 는 동 하나에도 수천 건이라 그대로 섞으면 내 식당이 묻힌다. 무작위 표본을 내 식당 수의 2배(최소 10, 최대 50)로 제한한다.
PLACE_SAMPLE_MIN = 10
PLACE_SAMPLE_MAX = 50

NO_CANDIDATES_MESSAGE = "조건에 맞는 식당이 없습니다. 카테고리·가격대 조건이나 최근 방문 제외 기간을 완화해 보세요."
NO_CANDIDATES_IN_REGION_MESSAGE = "내 위치 근처에 조건에 맞는 식당이 없습니다. 조건을 완화하거나 위치를 바꿔 보세요."


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


@dataclass(frozen=True)
class Candidate:
    """추천 후보 1건: 내 식당(row) 또는 공공데이터 동네 식당(place) 중 하나."""

    row: RestaurantRow | None = None
    place: Place | None = None

    def weight(self, today: date) -> float:
        return weight_of(self.row, today) if self.row is not None else PLACE_WEIGHT


def _pick_one(pool: list[Candidate], weighted: bool, today: date) -> Candidate:
    if not weighted:
        return random.choice(pool)
    return random.choices(pool, weights=[c.weight(today) for c in pool], k=1)[0]


def _pick_many(pool: list[Candidate], k: int, weighted: bool, today: date) -> list[Candidate]:
    """비복원 추출. 가중치는 뽑을 때마다 남은 후보 기준으로 다시 정규화된다."""
    rest = list(pool)
    out: list[Candidate] = []
    while rest and len(out) < k:
        c = _pick_one(rest, weighted, today)
        out.append(c)
        rest.remove(c)
    return out


class RecommendationService:
    def __init__(self, repo: RestaurantRepository, skips: SkipRepository, places: PlaceRepository):
        self.repo = repo
        self.skips = skips
        self.places = places

    def _dongs_of_group(self, sigungu: str | None, dong: str) -> list[str]:
        """동 그룹('역삼동')에 속하는 행정동 이름들. 행정동 이름('역삼1동')을 줘도 같은 그룹으로 해석된다."""
        group = dong_group(dong)
        return [d for d in self.places.dongs_like(sigungu=sigungu, stem=dong_stem(group)) if dong_group(d) == group]

    def _candidates(
        self, *, categories, price_levels, status, is_favorite, exclude_recent_days, stale_wishlist, today: date,
        sigungu: str | None = None, dong: str | None = None,
    ) -> tuple[list[Candidate], int]:
        """(후보 목록, 전체 후보 수). 전체 후보 수는 places 표본이 아니라 지역 내 places 전체 건수를 더한 값이다."""
        located = bool(sigungu or dong)
        dongs = self._dongs_of_group(sigungu, dong) if dong else None
        mine = self.repo.candidates(
            today=today,
            exclude_recent_days=exclude_recent_days,
            categories=categories,
            price_levels=price_levels,
            status=status,
            is_favorite=is_favorite,
            expiring_before=expiring_cutoff() if stale_wishlist else None,
            sigungu=sigungu,
            dong=dong,
            dongs=dongs,
        )
        pool = [Candidate(row=r) for r in mine]
        total = len(pool)
        # 상태·가격대·즐겨찾기·미뤄둔 곳은 내 식당 전용 속성이므로 켜져 있으면 공공데이터를 제외한다(통합 검색 규칙과 동일).
        if located and status is None and not price_levels and is_favorite is None and not stale_wishlist:
            place_total = self.places.count_in_region(sigungu=sigungu, dongs=dongs, categories=categories)
            limit = min(PLACE_SAMPLE_MAX, max(PLACE_SAMPLE_MIN, 2 * len(mine)))
            sample = self.places.sample_in_region(sigungu=sigungu, dongs=dongs, categories=categories, limit=limit)
            pool += [Candidate(place=p) for p in sample]
            total += place_total
        if not pool:
            raise NoCandidatesError(NO_CANDIDATES_IN_REGION_MESSAGE if located else NO_CANDIDATES_MESSAGE)
        return pool, total

    @staticmethod
    def _view(c: Candidate, cutoff) -> RecommendedRestaurant:
        if c.place is not None:
            p = c.place
            return RecommendedRestaurant(
                source="place",
                place_no=p.place_no,
                name=f"{p.name} {p.branch_name}" if p.branch_name else p.name,
                category=p.category,
                location=p.road_address or p.jibun_address,
            )
        r = c.row.restaurant
        return RecommendedRestaurant(
            id=r.id,
            name=r.name,
            category=r.category,
            status=r.status,
            price_level=r.price_level,
            location=r.location,
            memo=r.memo,
            is_favorite=r.is_favorite,
            **derived_fields(c.row, cutoff),
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
        exclude_place_no: str | None = None,
        weighted: bool = True,
        stale_wishlist: bool = False,
        sigungu: str | None = None,
        dong: str | None = None,
    ) -> RecommendationOut:
        today = date.today()
        pool, total = self._candidates(
            categories=categories,
            price_levels=price_levels,
            status=status,
            is_favorite=is_favorite,
            exclude_recent_days=exclude_recent_days,
            stale_wishlist=stale_wishlist,
            today=today,
            sigungu=sigungu,
            dong=dong,
        )

        def excluded(c: Candidate) -> bool:
            if c.row is not None:
                return c.row.restaurant.id == exclude_id
            return c.place.place_no == exclude_place_no

        # 직전 결과는 후보가 2곳 이상일 때만 제외한다.
        if (exclude_id is not None or exclude_place_no is not None) and len(pool) > 1:
            pool = [c for c in pool if not excluded(c)] or pool
        picked = _pick_one(pool, weighted, today)
        return RecommendationOut(restaurant=self._view(picked, expiring_cutoff()), candidate_count=total)

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
        sigungu: str | None = None,
        dong: str | None = None,
    ) -> CandidatesOut:
        today = date.today()
        pool, total = self._candidates(
            categories=categories,
            price_levels=price_levels,
            status=status,
            is_favorite=is_favorite,
            exclude_recent_days=exclude_recent_days,
            stale_wishlist=stale_wishlist,
            today=today,
            sigungu=sigungu,
            dong=dong,
        )
        cutoff = expiring_cutoff()
        picked = _pick_many(pool, count, weighted, today)
        return CandidatesOut(restaurants=[self._view(c, cutoff) for c in picked], candidate_count=total)

    def record_skip(self, restaurant_id: int) -> SkipOut:
        if self.repo.get(restaurant_id) is None:
            raise NotFoundError("식당을 찾을 수 없습니다.")
        s = self.skips.add(restaurant_id)
        return SkipOut(id=s.id, restaurant_id=s.restaurant_id, skipped_at=s.skipped_at)
