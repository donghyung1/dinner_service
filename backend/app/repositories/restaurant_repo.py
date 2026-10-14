from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import Select, and_, exists, func, or_, select
from sqlalchemy.orm import Session

from app.models import RecommendationSkip, Restaurant, RestaurantSort, RestaurantStatus, Visit


@dataclass(frozen=True)
class RestaurantRow:
    """식당 + 방문/넘김 집계 (집계 서브쿼리로 한 번에 조회)."""

    restaurant: Restaurant
    last_visited_on: date | None
    visit_count: int
    consecutive_skips: int
    suggestion_skips: int  # skip_dismissed_at 이후의 연속 넘김 수 (제안 노출 판단용)


def _last_visit_col():
    return (
        select(func.max(Visit.visited_on))
        .where(Visit.restaurant_id == Restaurant.id)
        .correlate(Restaurant)
        .scalar_subquery()
    )


def _visit_count_col():
    return (
        select(func.count(Visit.id))
        .where(Visit.restaurant_id == Restaurant.id)
        .correlate(Restaurant)
        .scalar_subquery()
    )


def _skip_count_col(*, after_dismissed: bool):
    """마지막 방문일보다 날짜가 엄밀히 큰 넘김 수 (방문 0회면 전체)."""
    last = _last_visit_col()
    cond = [
        RecommendationSkip.restaurant_id == Restaurant.id,
        or_(last.is_(None), func.date(RecommendationSkip.skipped_at) > last),
    ]
    if after_dismissed:
        cond.append(
            or_(
                Restaurant.skip_dismissed_at.is_(None),
                RecommendationSkip.skipped_at > Restaurant.skip_dismissed_at,
            )
        )
    return (
        select(func.count(RecommendationSkip.id)).where(and_(*cond)).correlate(Restaurant).scalar_subquery()
    )


def _row_select():
    return select(
        Restaurant,
        _last_visit_col().label("last_visited_on"),
        _visit_count_col().label("visit_count"),
        _skip_count_col(after_dismissed=False).label("consecutive_skips"),
        _skip_count_col(after_dismissed=True).label("suggestion_skips"),
    )


def _to_row(r) -> RestaurantRow:
    return RestaurantRow(r[0], r[1], int(r[2] or 0), int(r[3] or 0), int(r[4] or 0))


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

    def get_row(self, restaurant_id: int) -> RestaurantRow | None:
        row = self.db.execute(_row_select().where(Restaurant.id == restaurant_id)).first()
        return _to_row(row) if row else None

    def list(self, *, sort: RestaurantSort, limit: int, offset: int, **filters):
        last = _last_visit_col()
        stmt = _apply_filters(_row_select(), **filters)
        if sort == RestaurantSort.NAME:
            stmt = stmt.order_by(Restaurant.name, Restaurant.id)
        elif sort == RestaurantSort.LAST_VISITED_DESC:
            stmt = stmt.order_by(last.is_(None), last.desc(), Restaurant.id.desc())
        else:
            stmt = stmt.order_by(Restaurant.created_at.desc(), Restaurant.id.desc())
        rows = self.db.execute(stmt.limit(limit).offset(offset)).all()
        total = self.db.scalar(_apply_filters(select(func.count(Restaurant.id)), **filters)) or 0
        return [_to_row(r) for r in rows], total

    def candidates(
        self,
        *,
        today: date,
        exclude_recent_days: int,
        categories=None,
        price_levels=None,
        status=None,
        is_favorite: bool | None = None,
        expiring_before: datetime | None = None,
    ) -> list[RestaurantRow]:
        """추천 후보 목록. expiring_before가 있으면 '곧 잊혀짐' 식당만."""
        stmt = _apply_filters(
            _row_select(),
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
        if expiring_before is not None:
            stmt = stmt.where(
                Restaurant.status == RestaurantStatus.WISHLIST,
                Restaurant.created_at <= expiring_before,
                ~exists().where(Visit.restaurant_id == Restaurant.id),
            )
        return [_to_row(r) for r in self.db.execute(stmt).all()]

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
