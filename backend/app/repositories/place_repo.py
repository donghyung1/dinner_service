import random

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

    def browse(self, *, sigungu, dong, categories, q, offset: int, limit: int):
        flt = dict(sigungu=sigungu, dong=dong, categories=categories, q=q)
        total = self.db.scalar(self._browse_filters(select(func.count()).select_from(Place), **flt)) or 0
        stmt = self._browse_filters(select(Place, self._registered().label("already_registered")), **flt)
        stmt = stmt.order_by(Place.name, Place.id).offset(offset).limit(limit)
        return [(p, bool(reg)) for p, reg in self.db.execute(stmt).all()], int(total)

    def random_one(self, *, sigungu, dong, categories, q, exclude_registered: bool):
        """COUNT 후 무작위 offset 으로 1건. ORDER BY RAND() 전체 정렬을 피한다."""
        flt = dict(sigungu=sigungu, dong=dong, categories=categories, q=q, exclude_registered=exclude_registered)
        total = self.db.scalar(self._browse_filters(select(func.count()).select_from(Place), **flt)) or 0
        if total == 0:
            return None
        stmt = self._browse_filters(select(Place, self._registered().label("already_registered")), **flt)
        stmt = stmt.order_by(Place.id).offset(random.randrange(total)).limit(1)
        row = self.db.execute(stmt).first()
        return (row[0], bool(row[1])) if row else None
