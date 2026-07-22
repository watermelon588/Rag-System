"""Authentication service: registration, login and token refresh."""

from __future__ import annotations

from app.core.exceptions import AuthenticationError, ConflictError
from app.core.logging import get_logger
from app.core.security import (
    REFRESH_TOKEN,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.models import User
from app.db.repositories import UserRepository
from app.schemas.auth import TokenPair

logger = get_logger(__name__)


class AuthService:
    def __init__(self, users: UserRepository):
        self._users = users

    def register(self, email: str, display_name: str, password: str) -> tuple[User, TokenPair]:
        email = email.strip().lower()
        if self._users.get_by_email(email):
            raise ConflictError("An account with this email already exists")

        user = self._users.create(
            email=email,
            display_name=display_name.strip(),
            password_hash=hash_password(password),
        )
        logger.info("Registered new user %s", user.id)
        return user, self._issue_tokens(user)

    def login(self, email: str, password: str) -> tuple[User, TokenPair]:
        user = self._users.get_by_email(email.strip().lower())
        # Verify against a dummy hash on unknown emails so response timing
        # does not reveal whether an account exists.
        stored_hash = user.password_hash if user else hash_password("timing-equalizer")
        if not verify_password(password, stored_hash) or user is None:
            raise AuthenticationError("Incorrect email or password")
        return user, self._issue_tokens(user)

    def refresh(self, refresh_token: str) -> tuple[User, TokenPair]:
        payload = decode_token(refresh_token, expected_type=REFRESH_TOKEN)
        user = self._users.get_by_id(payload["sub"])
        if user is None:
            raise AuthenticationError("Account no longer exists")
        return user, self._issue_tokens(user)

    def get_user(self, user_id: str) -> User | None:
        return self._users.get_by_id(user_id)

    def update_profile(
        self,
        user: User,
        *,
        display_name: str | None = None,
        bio: str | None = None,
        avatar_url: str | None = None,
    ) -> User:
        fields: dict = {}
        if display_name is not None:
            fields["display_name"] = display_name.strip()
        if bio is not None:
            fields["bio"] = bio.strip()
        if avatar_url is not None:
            fields["avatar_url"] = avatar_url or None
        if fields:
            self._users.update(user.id, fields)
        refreshed = self._users.get_by_id(user.id)
        return refreshed or user

    def change_password(
        self, user: User, current_password: str, new_password: str
    ) -> None:
        if not verify_password(current_password, user.password_hash):
            raise AuthenticationError("Current password is incorrect")
        self._users.update(user.id, {"password_hash": hash_password(new_password)})
        logger.info("Password changed for user %s", user.id)

    @staticmethod
    def _issue_tokens(user: User) -> TokenPair:
        return TokenPair(
            access_token=create_access_token(user.id),
            refresh_token=create_refresh_token(user.id),
        )
