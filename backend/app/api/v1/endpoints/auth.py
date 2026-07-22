"""Authentication endpoints (cookie + JWT).

On register / login / refresh the JWT access & refresh tokens are set as
httpOnly cookies. The tokens are also returned in the body for non-browser
API clients, but browsers rely purely on the cookies (which page JS cannot
read). ``logout`` clears them.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from app.api.deps import (
    CurrentUser,
    get_auth_service,
    get_chat_repo,
    get_document_repo,
    get_saved_result_repo,
    get_search_history_repo,
)
from app.core.config import get_settings
from app.core.exceptions import AuthenticationError
from app.core.security import clear_auth_cookies, set_auth_cookies
from app.db.repositories import (
    ChatRepository,
    DocumentRepository,
    SavedResultRepository,
    SearchHistoryRepository,
)
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    ProfileStats,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UpdateProfileRequest,
    UserProfile,
)
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])

AuthSvc = Annotated[AuthService, Depends(get_auth_service)]
DocRepo = Annotated[DocumentRepository, Depends(get_document_repo)]
ChatRepo = Annotated[ChatRepository, Depends(get_chat_repo)]
HistoryRepo = Annotated[SearchHistoryRepository, Depends(get_search_history_repo)]
SavedRepo = Annotated[SavedResultRepository, Depends(get_saved_result_repo)]


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


@router.patch("/me", response_model=UserProfile)
def update_me(body: UpdateProfileRequest, user: CurrentUser, auth: AuthSvc) -> UserProfile:
    updated = auth.update_profile(
        user,
        display_name=body.display_name,
        bio=body.bio,
        avatar_url=body.avatar_url,
    )
    return UserProfile.model_validate(updated)


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordRequest, user: CurrentUser, auth: AuthSvc) -> None:
    auth.change_password(user, body.current_password, body.new_password)


@router.get("/me/stats", response_model=ProfileStats)
def my_stats(
    user: CurrentUser,
    documents: DocRepo,
    chats: ChatRepo,
    history: HistoryRepo,
    saved: SavedRepo,
) -> ProfileStats:
    return ProfileStats(
        documents=documents.count_by_owner(user.id),
        chat_sessions=chats.count_sessions(user.id),
        searches=history.count(user.id),
        saved_results=saved.count(user.id),
    )
