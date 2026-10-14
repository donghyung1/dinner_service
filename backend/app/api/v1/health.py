import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # 자격증명/스택트레이스 노출 방지: 예외 타입만 로깅
        logger.error("health check: DB unreachable (%s)", type(exc).__name__)
        return JSONResponse(status_code=503, content={"status": "error", "app": "ok", "db": "down"})
    return {"status": "ok", "app": "ok", "db": "ok"}
