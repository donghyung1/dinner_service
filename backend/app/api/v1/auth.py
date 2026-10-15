from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Response

from app.api.deps import SESSION_COOKIE, get_auth_service, get_current_user
from app.core.config import get_settings
from app.models import User
from app.schemas.auth import LoginRequest, MeOut, SignupRequest
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])
Svc = Annotated[AuthService, Depends(get_auth_service)]


def _set_session_cookie(response: Response, token: str, max_age: int) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=max_age,
        path="/",
        httponly=True,
        samesite="lax",
        secure=get_settings().SESSION_COOKIE_SECURE,
    )


@router.post("/login", response_model=MeOut)
def login(body: LoginRequest, response: Response, svc: Svc):
    user, token, max_age = svc.login(body.username.strip(), body.password)
    _set_session_cookie(response, token, max_age)
    return MeOut(username=user.username)


@router.post("/signup", response_model=MeOut, status_code=201)
def signup(body: SignupRequest, response: Response, svc: Svc):
    user, token, max_age = svc.signup(body.username, body.password)
    _set_session_cookie(response, token, max_age)
    return MeOut(username=user.username)


@router.post("/logout", status_code=204)
def logout(response: Response, svc: Svc, token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None):
    svc.logout(token)
    response.delete_cookie(
        SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=get_settings().SESSION_COOKIE_SECURE
    )


@router.get("/me", response_model=MeOut)
def me(user: Annotated[User, Depends(get_current_user)]):
    return MeOut(username=user.username)
