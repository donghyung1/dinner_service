from pydantic import BaseModel

from app.models.enums import Category


class PlaceOut(BaseModel):
    id: int
    place_no: str
    name: str
    branch_name: str | None
    category: Category
    industry_mid: str
    industry_small: str | None
    location: str | None
    sido: str
    sigungu: str
    dong: str | None
    already_registered: bool


class PlaceList(BaseModel):
    items: list[PlaceOut]
    count: int
    limit: int
