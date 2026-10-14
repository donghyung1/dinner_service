from collections.abc import Sequence
from datetime import date, timedelta

from sqlalchemy import Select, exists, func, or_, select
from sqlalchemy.orm import Session

from app.models import Restaurant, RestaurantSort, Visit


def _last_visit_col():
    return (
        select(func.max(Visit.visited_on))
        .where(Visit.restaurant_id == Restaurant.id)
        .correlate(Restaurant)
        .scalar_subquery()
    )


def _apply_filters(
    stmt: Select,
    *,
    q: str | None = None,
    categories: Sequence | None = None,
    price_levels: Sequence[int] | None = None,
    status=None,
    is_favorite: bool | None = None,
) -> Select:
    if q:
        like = f"%{q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')}%"
        stmt = stmt.where(or_(Restaurant.name.like(like, escape="\\"), Restaurant.memo.like(like, escape="\\")))
    if categories:
        stmt = stmt.where(Restaurant.category.in_(categories))
    if price_levels:
        stmt = stmt.where(Restaurant.price_level.in_(price_levels))
    if status is not None:
        stmt = stmt.where(Restaurant.status == status)
    if is_favorite is not None:
        stmt = stmt.where(Restaurant.is_favorite.is_(is_favorite))
    return stmt


class RestaurantRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, restaurant_id: int) -> Restaurant | None:
        return self.db.get(Restaurant, restaurant_id)

    def get_with_last_visit(self, restaurant_id: int):
        row = self.db.execute(
            select(Restaurant, _last_visit_col()).where(Restaurant.id == restaurant_id)
        ).first()
        return (row[0], row[1]) if row else None

    def list(self, *, sort: RestaurantSort, limit: int, offset: int, **filters):
        last = _last_visit_col().label("last_visited_on")
        stmt = _apply_filters(select(Restaurant, last), **filters)
        if sort == RestaurantSort.NAME:
            stmt = stmt.order_by(Restaurant.name, Restaurant.id)
        elif sort == RestaurantSort.LAST_VISITED_DESC:
            stmt = stmt.order_by(last.is_(None), last.desc(), Restaurant.id.desc())
        else:
            stmt = stmt.order_by(Restaurant.created_at.desc(), Restaurant.id.desc())
        rows = self.db.execute(stmt.limit(limit).offset(offset)).all()
        total = self.db.scalar(_apply_filters(select(func.count(Restaurant.id)), **filters)) or 0
        return [(r, d) for r, d in rows], total

    def candidates(
        self,
        *,
        today: date,
        exclude_recent_days: int,
        categories=None,
        price_levels=None,
        status=None,
        is_favorite: bool | None = None,
    ):
        """추천 후보 (Restaurant, last_visited_on) 목록."""
        stmt = _apply_filters(
            select(Restaurant, _last_visit_col()),
            categories=categories,
            price_levels=price_levels,
            status=status,
            is_favorite=is_favorite,
        )
        if exclude_recent_days > 0:
            since = today - timedelta(days=exclude_recent_days)
            stmt = stmt.where(
                ~exists().where(Visit.restaurant_id == Restaurant.id, Visit.visited_on >= since)
            )
        return [(r, d) for r, d in self.db.execute(stmt).all()]

    def add(self, restaurant: Restaurant) -> Restaurant:
        self.db.add(restaurant)
        self.db.commit()
        self.db.refresh(restaurant)
        return restaurant

    def save(self, restaurant: Restaurant) -> Restaurant:
        self.db.commit()
        self.db.refresh(restaurant)
        return restaurant

    def delete(self, restaurant: Restaurant) -> None:
        self.db.delete(restaurant)
        self.db.commit()
