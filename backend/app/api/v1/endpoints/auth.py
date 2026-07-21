"""Authentication endpoints (cookie + JWT).

On register / login / refresh the JWT access & refresh tokens are set as
httpOnly cookies. The tokens are also returned in the body for non-browser
API clients, but browsers rely purely on the cookies (which page JS cannot
read). ``logout`` clears them.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from app.api.deps import CurrentUser, get_auth_service
from app.core.config import get_settings
from app.core.exceptions import AuthenticationError
from app.core.security import clear_auth_cookies, set_auth_cookies
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserProfile,
)
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])

AuthSvc = Annotated[AuthService, Depends(get_auth_service)]


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(body: RegisterRequest, response: Response, auth: AuthSvc) -> AuthResponse:
    user, tokens = auth.register(body.email, body.display_name, body.password)
    set_auth_cookies(response, tokens)
    return AuthResponse(user=UserProfile.model_validate(user), tokens=tokens)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, response: Response, auth: AuthSvc) -> AuthResponse:
    user, tokens = auth.login(body.email, body.password)
    set_auth_cookies(response, tokens)
    return AuthResponse(user=UserProfile.model_validate(user), tokens=tokens)


@router.post("/refresh", response_model=TokenPair)
def refresh(
    request: Request,
    response: Response,
    auth: AuthSvc,
    body: RefreshRequest | None = None,
) -> TokenPair:
    settings = get_settings()
    token = request.cookies.get(settings.refresh_cookie_name)
    if not token and body is not None:
        token = body.refresh_token
    if not token:
        raise AuthenticationError("Missing refresh token")

    _user, tokens = auth.refresh(token)
    set_auth_cookies(response, tokens)
    return tokens


@router.post("/logout", status_code=204)
def logout(response: Response) -> None:
    clear_auth_cookies(response)


@router.get("/me", response_model=UserProfile)
def me(user: CurrentUser) -> UserProfile:
    return UserProfile.model_validate(user)
