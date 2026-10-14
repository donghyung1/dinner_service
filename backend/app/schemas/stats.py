from datetime import date

from pydantic import BaseModel, Field

from app.models.enums import Category


class CategoryGapItem(BaseModel):
    category: Category
    restaurant_count: int
    last_visited_on: date | None
    days_since: int | None


class CategoryGapOut(BaseModel):
    gap: CategoryGapItem | None
    categories: list[CategoryGapItem]


class CategoryCount(BaseModel):
    category: Category
    count: int
    ratio: float


class TopRestaurant(BaseModel):
    restaurant_id: int
    name: str
    count: int


class CategoryStreak(BaseModel):
    category: Category
    length: int
    from_: date = Field(serialization_alias="from")
    to: date


class RecommendationStat(BaseModel):
    accepted_count: int
    accept_ratio: float | None


class MonthlyStatsOut(BaseModel):
    month: str
    total_visits: int
    category_distribution: list[CategoryCount]
    top_restaurants: list[TopRestaurant]
    longest_category_streak: CategoryStreak | None
    recommendation: RecommendationStat
    skip_count: int
