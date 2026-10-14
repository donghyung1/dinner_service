from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import Category, RestaurantStatus
from app.schemas.visit import VisitOut


class RestaurantBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: Category
    status: RestaurantStatus = RestaurantStatus.WISHLIST
    price_level: int | None = Field(default=None, ge=1, le=4)
    location: str | None = Field(default=None, max_length=255)
    memo: str | None = Field(default=None, max_length=1000)
    is_favorite: bool = False

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("이름은 공백일 수 없습니다.")
        return v


class RestaurantCreate(RestaurantBase):
    pass


class RestaurantUpdate(RestaurantBase):
    """PUT: 전체 교체. 등록과 동일한 본문."""


class FavoriteUpdate(BaseModel):
    is_favorite: bool


class RestaurantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: Category
    status: RestaurantStatus
    price_level: int | None
    location: str | None
    memo: str | None
    is_favorite: bool
    created_at: datetime
    updated_at: datetime
    last_visited_on: date | None = None


class RestaurantDetail(RestaurantOut):
    recent_visits: list[VisitOut] = []


class RestaurantList(BaseModel):
    items: list[RestaurantOut]
    total: int
    limit: int
    offset: int


class RecommendedRestaurant(BaseModel):
    id: int
    name: str
    category: Category
    status: RestaurantStatus
    price_level: int | None
    location: str | None
    memo: str | None
    is_favorite: bool
    last_visited_on: date | None


class RecommendationOut(BaseModel):
    restaurant: RecommendedRestaurant
    candidate_count: int
