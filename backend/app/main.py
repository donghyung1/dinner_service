import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth, health, places, recommendations, restaurants, stats, visits
from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.errors import register_error_handlers

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from sqlalchemy import text

    from app.db.session import engine

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        logger.error("startup: DB connection failed (%s)", type(exc).__name__)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    is_dev = settings.APP_ENV == "dev"
    app = FastAPI(
        lifespan=lifespan,
        title="오늘 뭐 먹지? API",
        docs_url="/docs" if is_dev else None,
        redoc_url=None,
        openapi_url="/openapi.json" if is_dev else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,  # origin 은 명시 목록만 허용(와일드카드 제외). 세션 쿠키용
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    # /health 와 /auth(로그인·로그아웃·me 는 라우터 내부에서 각자 처리)만 공개. 나머지는 모두 로그인 필요.
    app.include_router(health.router, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api/v1")
    for r in (restaurants.router, visits.router, recommendations.router, stats.router, places.router):
        app.include_router(r, prefix="/api/v1", dependencies=[Depends(get_current_user)])

    return app


app = create_app()
