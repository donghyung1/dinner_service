from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import re

from sqlalchemy import Select, and_, exists, func, or_, select
from sqlalchemy.orm import Session

from app.models import Place, RecommendationSkip, Restaurant, RestaurantSort, RestaurantStatus, Visit


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


def _like(token: str) -> str:
    return f"%{token.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')}%"


def _dong_stem(dong: str) -> str | None:
    """'역삼1동' -> '역삼', '종로1가' -> '종로'. 어간이 2자 미만이면 None."""
    stem = re.sub(r"[\d.·]+", "", dong)
    if stem and stem[-1] in "동가":
        stem = stem[:-1]
    return stem if len(stem) >= 2 else None


def _region_clause(sigungu: str | None, dong: str | None, dongs: Sequence[str] | None = None):
    """내 식당의 지역 판정(근사). 카탈로그에 연결된 식당은 places 의 시군구/동으로 정확히,
    연결되지 않은 식당은 location 문자열에 지역명이 포함되는지로 판정한다.
    dongs 가 있으면(동 그룹) 연결 식당은 places.dong 이 그 행정동들 중 하나인지로 판정한다."""
    linked_cond = [Place.place_no == Restaurant.place_no]
    text_cond = []
    if sigungu:
        linked_cond.append(Place.sigungu == sigungu)
        text_cond.append(Restaurant.location.like(_like(sigungu), escape="\\"))
    if dong:
        linked_cond.append(Place.dong.in_(dongs) if dongs is not None else Place.dong == dong)
        names = [dong] + ([s] if (s := _dong_stem(dong)) else [])
        text_cond.append(or_(*(Restaurant.location.like(_like(n), escape="\\") for n in names)))
    linked_any = exists().where(Place.place_no == Restaurant.place_no).correlate(Restaurant)
    return or_(
        exists().where(*linked_cond).correlate(Restaurant),
        and_(~linked_any, *text_cond),
    )


def _apply_filters(
    stmt: Select,
    *,
    q: str | None = None,
    categories: Sequence | None = None,
    price_levels: Sequence[int] | None = None,
    status=None,
    is_favorite: bool | None = None,
    sigungu: str | None = None,
    dong: str | None = None,
    dongs: Sequence[str] | None = None,
) -> Select:
    if sigungu or dong:
        stmt = stmt.where(_region_clause(sigungu, dong, dongs))
    if q:
        like = _like(q)
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

    def count(self, **filters) -> int:
        return int(self.db.scalar(_apply_filters(select(func.count(Restaurant.id)), **filters)) or 0)

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
        sigungu: str | None = None,
        dong: str | None = None,
        dongs: Sequence[str] | None = None,
    ) -> list[RestaurantRow]:
        """추천 후보 목록. expiring_before가 있으면 '곧 잊혀짐' 식당만. 지역(내 위치)이 있으면 그 동네만."""
        stmt = _apply_filters(
            _row_select(),
            sigungu=sigungu,
            dong=dong,
            dongs=dongs,
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
