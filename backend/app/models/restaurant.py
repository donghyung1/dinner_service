from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntId, TinyUInt
from app.models.enums import Category, RestaurantStatus, VisitSource


def _enum(e):
    return Enum(e, native_enum=True, values_callable=lambda x: [m.value for m in x], validate_strings=True)


class Restaurant(Base):
    __tablename__ = "restaurants"
    __table_args__ = (
        CheckConstraint("price_level BETWEEN 1 AND 4", name="chk_restaurants_price_level"),
        Index("idx_restaurants_category_status", "category", "status"),
        Index("idx_restaurants_name", "name"),
        Index("idx_restaurants_place_no", "place_no"),
    )

    id: Mapped[int] = mapped_column(BigIntId, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[Category] = mapped_column(_enum(Category), nullable=False)
    status: Mapped[RestaurantStatus] = mapped_column(
        _enum(RestaurantStatus), nullable=False, default=RestaurantStatus.WISHLIST, server_default="WISHLIST"
    )
    price_level: Mapped[int | None] = mapped_column(TinyUInt, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_favorite: Mapped[bool] = mapped_column(nullable=False, default=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    skip_dismissed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 카탈로그(places.place_no)에서 골라 등록한 경우의 상가업소번호. FK 없는 논리적 참조.
    place_no: Mapped[str | None] = mapped_column(String(30), nullable=True)

    visits: Mapped[list[Visit]] = relationship(
        back_populates="restaurant", cascade="all, delete-orphan", passive_deletes=True
    )
    skips: Mapped[list[RecommendationSkip]] = relationship(
        back_populates="restaurant", cascade="all, delete-orphan", passive_deletes=True
    )


class Visit(Base):
    __tablename__ = "visits"
    __table_args__ = (
        Index("idx_visits_restaurant_date", "restaurant_id", "visited_on"),
        Index("idx_visits_date", "visited_on"),
    )

    id: Mapped[int] = mapped_column(BigIntId, primary_key=True, autoincrement=True)
    restaurant_id: Mapped[int] = mapped_column(
        BigIntId, ForeignKey("restaurants.id", ondelete="CASCADE", name="fk_visits_restaurant"), nullable=False
    )
    visited_on: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[VisitSource] = mapped_column(
        _enum(VisitSource), nullable=False, default=VisitSource.MANUAL, server_default="MANUAL"
    )
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    restaurant: Mapped[Restaurant] = relationship(back_populates="visits")

    @property
    def restaurant_name(self) -> str:
        return self.restaurant.name


class RecommendationSkip(Base):
    __tablename__ = "recommendation_skips"
    __table_args__ = (
        Index("idx_skips_restaurant_time", "restaurant_id", "skipped_at"),
        Index("idx_skips_time", "skipped_at"),
    )

    id: Mapped[int] = mapped_column(BigIntId, primary_key=True, autoincrement=True)
    restaurant_id: Mapped[int] = mapped_column(
        BigIntId, ForeignKey("restaurants.id", ondelete="CASCADE", name="fk_skips_restaurant"), nullable=False
    )
    skipped_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    restaurant: Mapped[Restaurant] = relationship(back_populates="skips")
