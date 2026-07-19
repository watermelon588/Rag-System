"""Authentication endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_auth_service
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
def register(body: RegisterRequest, auth: AuthSvc) -> AuthResponse:
    user, tokens = auth.register(body.email, body.display_name, body.password)
    return AuthResponse(user=UserProfile.model_validate(user), tokens=tokens)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, auth: AuthSvc) -> AuthResponse:
    user, tokens = auth.login(body.email, body.password)
    return AuthResponse(user=UserProfile.model_validate(user), tokens=tokens)


@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest, auth: AuthSvc) -> TokenPair:
    return auth.refresh(body.refresh_token)


@router.get("/me", response_model=UserProfile)
def me(user: CurrentUser) -> UserProfile:
    return UserProfile.model_validate(user)
