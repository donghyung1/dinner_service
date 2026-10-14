from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Restaurant, Visit


class StatsRepository:
    def __init__(self, db: Session):
        self.db = db

    def category_summary(self) -> list[tuple]:
        """카테고리별 (category, 식당 수, 마지막 방문일). 식당이 있는 카테고리만."""
        last = (
            select(Visit.restaurant_id.label("rid"), func.max(Visit.visited_on).label("last"))
            .group_by(Visit.restaurant_id)
            .subquery()
        )
        stmt = (
            select(Restaurant.category, func.count(Restaurant.id), func.max(last.c.last))
            .outerjoin(last, last.c.rid == Restaurant.id)
            .group_by(Restaurant.category)
        )
        return [(c, int(n), d) for c, n, d in self.db.execute(stmt).all()]

    def total_visits(self) -> int:
        return self.db.scalar(select(func.count(Visit.id))) or 0

    def visits_between(self, start: date, end: date) -> list[tuple]:
        """start <= visited_on < end 방문을 (visited_on, id) 순으로. (id, visited_on, source, restaurant_id, name, category)"""
        stmt = (
            select(Visit.id, Visit.visited_on, Visit.source, Restaurant.id, Restaurant.name, Restaurant.category)
            .join(Restaurant, Restaurant.id == Visit.restaurant_id)
            .where(Visit.visited_on >= start, Visit.visited_on < end)
            .order_by(Visit.visited_on, Visit.id)
        )
        return [tuple(r) for r in self.db.execute(stmt).all()]
