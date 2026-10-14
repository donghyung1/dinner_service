import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    status_code = 400
    code = "BAD_REQUEST"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class NoCandidatesError(NotFoundError):
    code = "NO_CANDIDATES"


def error_body(code: str, message: str, details: list | None = None) -> dict:
    err: dict = {"code": code, "message": message}
    if details is not None:
        err["details"] = details
    return {"error": err}


_HTTP_CODES = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 400: "BAD_REQUEST"}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_r: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content=error_body(exc.code, exc.message))

    @app.exception_handler(RequestValidationError)
    async def _validation(_r: Request, exc: RequestValidationError):
        details = [
            {"loc": [str(p) for p in e.get("loc", ())], "message": str(e.get("msg", "")), "type": e.get("type", "")}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=422, content=error_body("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", details)
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_r: Request, exc: StarletteHTTPException):
        code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        msg = "리소스를 찾을 수 없습니다." if exc.status_code == 404 else "요청을 처리할 수 없습니다."
        return JSONResponse(status_code=exc.status_code, content=error_body(code, msg))

    @app.exception_handler(Exception)
    async def _unhandled(_r: Request, exc: Exception):
        logger.error("unhandled error (%s)", type(exc).__name__)
        return JSONResponse(
            status_code=500, content=error_body("INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
        )
