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
    place_no: str | None = Field(default=None, max_length=30)

    @field_validator("place_no")
    @classmethod
    def _blank_place_no(cls, v: str | None) -> str | None:
        v = v.strip() if v else None
        return v or None


class RestaurantUpdate(RestaurantCreate):
    """PUT: 전체 교체. 등록과 동일한 본문. place_no를 생략하면 기존 값을 유지한다."""


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
    place_no: str | None = None
    created_at: datetime
    updated_at: datetime
    last_visited_on: date | None = None
    is_expiring: bool = False
    consecutive_skips: int = 0
    skip_suggestion: bool = False


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
    is_expiring: bool
    consecutive_skips: int
    skip_suggestion: bool


class RecommendationOut(BaseModel):
    restaurant: RecommendedRestaurant
    candidate_count: int


class CandidatesOut(BaseModel):
    restaurants: list[RecommendedRestaurant]
    candidate_count: int


class SkipCreate(BaseModel):
    restaurant_id: int = Field(ge=1)


class SkipOut(BaseModel):
    id: int
    restaurant_id: int
    skipped_at: datetime
