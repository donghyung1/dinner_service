from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, Index, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntId
from app.models.enums import Category


class Place(Base):
    """공공데이터 상가(상권)정보 음식 업종 카탈로그. 임포트 CLI만 쓰고 API는 조회만 한다. restaurants와 FK 없음."""

    __tablename__ = "places"
    __table_args__ = (
        UniqueConstraint("place_no", name="uq_places_place_no"),
        Index("idx_places_name", "name"),
        Index("idx_places_region", "sido", "sigungu", "dong"),
    )

    id: Mapped[int] = mapped_column(BigIntId, primary_key=True, autoincrement=True)
    place_no: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    branch_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    industry_mid: Mapped[str] = mapped_column(String(50), nullable=False)
    industry_small: Mapped[str | None] = mapped_column(String(80), nullable=True)
    category: Mapped[Category] = mapped_column(
        Enum(Category, native_enum=True, values_callable=lambda x: [m.value for m in x], validate_strings=True),
        nullable=False,
    )
    sido: Mapped[str] = mapped_column(String(30), nullable=False)
    sigungu: Mapped[str] = mapped_column(String(30), nullable=False)
    dong: Mapped[str | None] = mapped_column(String(30), nullable=True)
    road_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    jibun_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lon: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
