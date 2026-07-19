"""Password hashing and JWT token primitives.

Passwords use PBKDF2-HMAC-SHA256 from the standard library (no fragile
native dependencies) with per-password random salts and constant-time
comparison. Tokens are signed JWTs carrying a ``type`` claim so access
and refresh tokens can never be substituted for one another.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError

_PBKDF2_ITERATIONS = 210_000
_HASH_SCHEME = "pbkdf2_sha256"

ACCESS_TOKEN = "access"
REFRESH_TOKEN = "refresh"


# ------------------------------------------------------------------ passwords

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), _PBKDF2_ITERATIONS
    ).hex()
    return f"{_HASH_SCHEME}${_PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt, expected = stored.split("$")
        if scheme != _HASH_SCHEME:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("utf-8"), int(iterations)
        ).hex()
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------- tokens

def _create_token(subject: str, token_type: str, lifetime: timedelta) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + lifetime,
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    return _create_token(
        user_id, ACCESS_TOKEN, timedelta(minutes=settings.access_token_expire_minutes)
    )


def create_refresh_token(user_id: str) -> str:
    settings = get_settings()
    return _create_token(
        user_id, REFRESH_TOKEN, timedelta(days=settings.refresh_token_expire_days)
    )


def decode_token(token: str, expected_type: str = ACCESS_TOKEN) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError("Invalid authentication token") from exc

    if payload.get("type") != expected_type:
        raise AuthenticationError("Invalid token type")
    if not payload.get("sub"):
        raise AuthenticationError("Malformed token")
    return payload
