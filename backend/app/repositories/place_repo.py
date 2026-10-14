from sqlalchemy import case, exists, func, or_, select
from sqlalchemy.orm import Session

from app.models import Category, Place, Restaurant


def _like_escape(token: str) -> str:
    return token.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class PlaceRepository:
    def __init__(self, db: Session):
        self.db = db

    def search(self, *, tokens: list[str], categories: list[Category] | None, limit: int):
        """토큰 AND 부분 일치 검색. 등록 여부는 EXISTS 서브쿼리로 한 번에 계산한다."""
        registered = exists().where(Restaurant.place_no == Place.place_no).correlate(Place)
        stmt = select(Place, registered.label("already_registered"))
        for t in tokens:
            pat = f"%{_like_escape(t)}%"
            stmt = stmt.where(
                or_(*(c.like(pat, escape="\\") for c in (
                    Place.name, Place.branch_name, Place.sigungu, Place.dong, Place.road_address
                )))
            )
        if categories:
            stmt = stmt.where(Place.category.in_(categories))
        prefix = f"{_like_escape(tokens[0])}%"
        stmt = stmt.order_by(
            case((Place.name.like(prefix, escape="\\"), 0), else_=1), Place.name, Place.id
        ).limit(limit)
        return [(p, bool(reg)) for p, reg in self.db.execute(stmt).all()]

    # --- 동네 둘러보기 (v0.7) ---

    @staticmethod
    def _registered():
        return exists().where(Restaurant.place_no == Place.place_no).correlate(Place)

    @staticmethod
    def _browse_filters(stmt, *, sigungu, dong, categories, q, exclude_registered=False):
        if sigungu:
            stmt = stmt.where(Place.sigungu == sigungu)
        if dong:
            stmt = stmt.where(Place.dong == dong)
        if categories:
            stmt = stmt.where(Place.category.in_(categories))
        if q:
            stmt = stmt.where(Place.name.like(f"%{_like_escape(q)}%", escape="\\"))
        if exclude_registered:
            stmt = stmt.where(~PlaceRepository._registered())
        return stmt

    def regions(self, *, sigungu: str | None) -> list[tuple[str, int]]:
        """sigungu 없으면 시군구별, 있으면 해당 시군구의 동별 건수(가나다순). 동이 없는 행은 제외한다."""
        col = Place.dong if sigungu else Place.sigungu
        stmt = select(col, func.count()).where(col.is_not(None)).group_by(col).order_by(col)
        if sigungu:
            stmt = stmt.where(Place.sigungu == sigungu)
        return [(name, int(n)) for name, n in self.db.execute(stmt).all()]

    def count(self, **flt) -> int:
        return int(self.db.scalar(self._browse_filters(select(func.count()).select_from(Place), **flt)) or 0)

    def page(self, *, offset: int, limit: int, **flt) -> list[Place]:
        """이름순(동률은 id) 페이지. 통합 목록(PRD 5.12)에서 내 식당 뒤에 이어 붙는다."""
        stmt = self._browse_filters(select(Place), **flt).order_by(Place.name, Place.id)
        return list(self.db.scalars(stmt.offset(offset).limit(limit)))

    # --- 내 위치 추천 (v0.9) ---

    def dongs_like(self, *, sigungu: str | None, stem: str) -> list[str]:
        """어간으로 시작하는 행정동 이름들(동 그룹 후보). 그룹 일치 판정은 호출 측(core.region)이 한다."""
        stmt = select(Place.dong).where(Place.dong.like(f"{_like_escape(stem)}%", escape="\\")).distinct()
        if sigungu:
            stmt = stmt.where(Place.sigungu == sigungu)
        return [d for d in self.db.scalars(stmt) if d]

    def count_in_region(self, *, sigungu, dongs, categories) -> int:
        stmt = self._region_filters(select(func.count()).select_from(Place), sigungu, dongs, categories)
        return int(self.db.scalar(stmt) or 0)

    def sample_in_region(self, *, sigungu, dongs, categories, limit: int) -> list[Place]:
        """내 식당에 아직 연결되지 않은 지역 내 식당 무작위 표본."""
        stmt = self._region_filters(select(Place), sigungu, dongs, categories)
        return list(self.db.scalars(stmt.order_by(func.rand()).limit(limit)))

    @staticmethod
    def _region_filters(stmt, sigungu, dongs, categories):
        if sigungu:
            stmt = stmt.where(Place.sigungu == sigungu)
        if dongs is not None:
            stmt = stmt.where(Place.dong.in_(dongs))
        if categories:
            stmt = stmt.where(Place.category.in_(categories))
        return stmt.where(~PlaceRepository._registered())
