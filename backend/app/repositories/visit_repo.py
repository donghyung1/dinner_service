from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Visit


class VisitRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, visit_id: int) -> Visit | None:
        return self.db.get(Visit, visit_id)

    def add(self, visit: Visit) -> Visit:
        self.db.add(visit)
        self.db.commit()
        self.db.refresh(visit)
        return visit

    def delete(self, visit: Visit) -> None:
        self.db.delete(visit)
        self.db.commit()

    def recent_for_restaurant(self, restaurant_id: int, limit: int = 10) -> list[Visit]:
        stmt = (
            select(Visit)
            .options(joinedload(Visit.restaurant))
            .where(Visit.restaurant_id == restaurant_id)
            .order_by(Visit.visited_on.desc(), Visit.id.desc())
            .limit(limit)
        )
        return list(self.db.scalars(stmt))

    def list(
        self,
        *,
        restaurant_id: int | None,
        date_from: date | None,
        date_to: date | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Visit], int]:
        def filt(stmt):
            if restaurant_id is not None:
                stmt = stmt.where(Visit.restaurant_id == restaurant_id)
            if date_from is not None:
                stmt = stmt.where(Visit.visited_on >= date_from)
            if date_to is not None:
                stmt = stmt.where(Visit.visited_on <= date_to)
            return stmt

        items = self.db.scalars(
            filt(select(Visit).options(joinedload(Visit.restaurant))).order_by(Visit.visited_on.desc(), Visit.id.desc()).limit(limit).offset(offset)
        )
        total = self.db.scalar(filt(select(func.count(Visit.id)))) or 0
        return list(items), total
