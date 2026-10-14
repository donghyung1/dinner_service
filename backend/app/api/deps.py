from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.place_repo import PlaceRepository
from app.repositories.restaurant_repo import RestaurantRepository
from app.repositories.skip_repo import SkipRepository
from app.repositories.stats_repo import StatsRepository
from app.repositories.visit_repo import VisitRepository
from app.services.place_service import PlaceService
from app.services.recommendation_service import RecommendationService
from app.services.restaurant_search_service import RestaurantSearchService
from app.services.restaurant_service import RestaurantService
from app.services.stats_service import StatsService
from app.services.visit_service import VisitService

def get_restaurant_service(db: Session = Depends(get_db)) -> RestaurantService:
    return RestaurantService(RestaurantRepository(db), VisitRepository(db))


def get_visit_service(db: Session = Depends(get_db)) -> VisitService:
    return VisitService(VisitRepository(db), RestaurantRepository(db))


def get_recommendation_service(db: Session = Depends(get_db)) -> RecommendationService:
    return RecommendationService(RestaurantRepository(db), SkipRepository(db))


def get_stats_service(db: Session = Depends(get_db)) -> StatsService:
    return StatsService(StatsRepository(db), SkipRepository(db))


def get_place_service(db: Session = Depends(get_db)) -> PlaceService:
    return PlaceService(PlaceRepository(db))


def get_restaurant_search_service(db: Session = Depends(get_db)) -> RestaurantSearchService:
    return RestaurantSearchService(RestaurantRepository(db), PlaceRepository(db))
