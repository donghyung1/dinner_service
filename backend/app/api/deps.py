import random

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.restaurant_repo import RestaurantRepository
from app.repositories.visit_repo import VisitRepository
from app.services.recommendation_service import RecommendationService
from app.services.restaurant_service import RestaurantService
from app.services.visit_service import VisitService

_rng = random.Random()


def get_rng() -> random.Random:
    return _rng


def get_restaurant_service(db: Session = Depends(get_db)) -> RestaurantService:
    return RestaurantService(RestaurantRepository(db), VisitRepository(db))


def get_visit_service(db: Session = Depends(get_db)) -> VisitService:
    return VisitService(VisitRepository(db), RestaurantRepository(db))


def get_recommendation_service(
    db: Session = Depends(get_db), rng: random.Random = Depends(get_rng)
) -> RecommendationService:
    return RecommendationService(RestaurantRepository(db), rng)
