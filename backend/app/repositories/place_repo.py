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
