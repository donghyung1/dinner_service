from app.models import Category
from app.repositories.place_repo import PlaceRepository
from app.schemas.place import PlaceList, PlaceOut


class PlaceService:
    def __init__(self, repo: PlaceRepository):
        self.repo = repo

    def search(self, *, q: str, categories: list[Category] | None, limit: int) -> PlaceList:
        tokens = q.split()
        items = [
            PlaceOut(
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
                already_registered=reg,
            )
            for p, reg in self.repo.search(tokens=tokens, categories=categories, limit=limit)
        ]
        return PlaceList(items=items, count=len(items), limit=limit)
