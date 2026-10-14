from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import RecommendationSkip


class SkipRepository:
    def __init__(self, db: Session):
        self.db = db

    def add(self, restaurant_id: int) -> RecommendationSkip:
        skip = RecommendationSkip(restaurant_id=restaurant_id)
        self.db.add(skip)
        self.db.commit()
        self.db.refresh(skip)
        return skip

    def count_between(self, start: datetime, end: datetime) -> int:
        """start <= skipped_at < end 인 넘김 수."""
        stmt = select(func.count(RecommendationSkip.id)).where(
            RecommendationSkip.skipped_at >= start, RecommendationSkip.skipped_at < end
        )
        return self.db.scalar(stmt) or 0
