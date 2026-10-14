from app.models import Category
from app.repositories.place_repo import PlaceRepository
from app.core.errors import NotFoundError
from app.schemas.place import PlaceBrowse, PlaceList, PlaceOut, RegionCount, RegionList


def _out(p, already_registered: bool) -> PlaceOut:
    return PlaceOut(
        id=p.id,
        place_no=p.place_no,
        name=p.name,
        branch_name=p.branch_name,
        category=p.category,
        industry_mid=p.industry_mid,
        industry_small=p.industry_small,
        location=p.road_address or p.jibun_address,
        sido=p.sido,
        sigungu=p.sigungu,
        dong=p.dong,
        already_registered=already_registered,
    )


class PlaceService:
    def __init__(self, repo: PlaceRepository):
        self.repo = repo

    def search(self, *, q: str, categories: list[Category] | None, limit: int) -> PlaceList:
        tokens = q.split()
        items = [_out(p, reg) for p, reg in self.repo.search(tokens=tokens, categories=categories, limit=limit)]
        return PlaceList(items=items, count=len(items), limit=limit)

    def regions(self, *, sigungu: str | None) -> RegionList:
        items = [RegionCount(name=n, count=c) for n, c in self.repo.regions(sigungu=sigungu)]
        return RegionList(sigungu=sigungu, items=items)

    def browse(self, *, sigungu, dong, categories, q, offset: int, limit: int) -> PlaceBrowse:
        rows, total = self.repo.browse(
            sigungu=sigungu, dong=dong, categories=categories, q=q, offset=offset, limit=limit
        )
        return PlaceBrowse(items=[_out(p, reg) for p, reg in rows], total=total, limit=limit, offset=offset)

    def random(self, *, sigungu, dong, categories, q, exclude_registered: bool) -> PlaceOut:
        hit = self.repo.random_one(
            sigungu=sigungu, dong=dong, categories=categories, q=q, exclude_registered=exclude_registered
        )
        if hit is None:
            raise NotFoundError("조건에 맞는 식당이 없습니다.")
        return _out(*hit)
