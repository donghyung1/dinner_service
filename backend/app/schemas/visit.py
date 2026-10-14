from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import VisitSource


class VisitCreate(BaseModel):
    restaurant_id: int = Field(ge=1)
    visited_on: date | None = None  # 미지정 시 오늘
    source: VisitSource = VisitSource.MANUAL
    note: str | None = Field(default=None, max_length=255)


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    restaurant_id: int
    restaurant_name: str
    visited_on: date
    source: VisitSource
    note: str | None
    created_at: datetime


class VisitList(BaseModel):
    items: list[VisitOut]
    total: int
    limit: int
    offset: int
