"""Authentication service: registration, login and token refresh."""

from __future__ import annotations

from sqlalchemy.orm import Session

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
from app.schemas.auth import TokenPair

logger = get_logger(__name__)


class AuthService:
    def __init__(self, db: Session):
        self._db = db

    def register(self, email: str, display_name: str, password: str) -> tuple[User, TokenPair]:
        email = email.strip().lower()
        if self._db.query(User).filter(User.email == email).first():
            raise ConflictError("An account with this email already exists")

        user = User(
            email=email,
            display_name=display_name.strip(),
            password_hash=hash_password(password),
        )
        self._db.add(user)
        self._db.commit()
        logger.info("Registered new user %s", user.id)
        return user, self._issue_tokens(user)

    def login(self, email: str, password: str) -> tuple[User, TokenPair]:
        user = self._db.query(User).filter(User.email == email.strip().lower()).first()
        # Verify against a dummy hash on unknown emails so response timing
        # does not reveal whether an account exists.
        stored_hash = user.password_hash if user else hash_password("timing-equalizer")
        if not verify_password(password, stored_hash) or user is None:
            raise AuthenticationError("Incorrect email or password")
        return user, self._issue_tokens(user)

    def refresh(self, refresh_token: str) -> TokenPair:
        payload = decode_token(refresh_token, expected_type=REFRESH_TOKEN)
        user = self._db.query(User).filter(User.id == payload["sub"]).first()
        if user is None:
            raise AuthenticationError("Account no longer exists")
        return self._issue_tokens(user)

    def get_user(self, user_id: str) -> User | None:
        return self._db.query(User).filter(User.id == user_id).first()

    @staticmethod
    def _issue_tokens(user: User) -> TokenPair:
        return TokenPair(
            access_token=create_access_token(user.id),
            refresh_token=create_refresh_token(user.id),
        )
