from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy.orm import Session

from app.core.errors import UnauthorizedError
from app.db.session import get_db
from app.models import User
from app.repositories.place_repo import PlaceRepository
from app.repositories.restaurant_repo import RestaurantRepository
from app.repositories.skip_repo import SkipRepository
from app.repositories.stats_repo import StatsRepository
from app.repositories.user_repo import SessionRepository, UserRepository
from app.repositories.visit_repo import VisitRepository
from app.services.auth_service import AuthService
from app.services.place_service import PlaceService
from app.services.recommendation_service import RecommendationService
from app.services.restaurant_search_service import RestaurantSearchService
from app.services.restaurant_service import RestaurantService
from app.services.stats_service import StatsService
from app.services.visit_service import VisitService

SESSION_COOKIE = "session"


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(UserRepository(db), SessionRepository(db))


def get_current_user(
    svc: Annotated[AuthService, Depends(get_auth_service)],
    token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> User:
    """유효한(만료되지 않은) 세션 쿠키가 없으면 401. 보호할 라우터에 dependencies 로 건다."""
    user = svc.user_for_token(token)
    if user is None:
        raise UnauthorizedError("로그인이 필요합니다.")
    return user


def get_restaurant_service(db: Session = Depends(get_db)) -> RestaurantService:
    return RestaurantService(RestaurantRepository(db), VisitRepository(db))


def get_visit_service(db: Session = Depends(get_db)) -> VisitService:
    return VisitService(VisitRepository(db), RestaurantRepository(db))


def get_recommendation_service(db: Session = Depends(get_db)) -> RecommendationService:
    return RecommendationService(RestaurantRepository(db), SkipRepository(db), PlaceRepository(db))


def get_stats_service(db: Session = Depends(get_db)) -> StatsService:
    return StatsService(StatsRepository(db), SkipRepository(db))


def get_place_service(db: Session = Depends(get_db)) -> PlaceService:
    return PlaceService(PlaceRepository(db))


def get_restaurant_search_service(db: Session = Depends(get_db)) -> RestaurantSearchService:
    return RestaurantSearchService(RestaurantRepository(db), PlaceRepository(db))
