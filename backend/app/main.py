import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import health, places, recommendations, restaurants, stats, visits
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
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    for r in (health.router, restaurants.router, visits.router, recommendations.router, stats.router, places.router):
        app.include_router(r, prefix="/api/v1")

    return app


app = create_app()
