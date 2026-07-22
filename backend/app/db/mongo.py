"""MongoDB connection management.

A single :class:`MongoClient` is created lazily and shared for the process
lifetime (the client is thread-safe and pools connections internally).
Works against MongoDB Atlas (``mongodb+srv://…``) or a local server.
"""

from __future__ import annotations

from functools import lru_cache

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Collection names — referenced through helpers so they never drift.
USERS = "users"
DOCUMENTS = "documents"
CHUNKS = "document_chunks"
CHAT_SESSIONS = "chat_sessions"
CHAT_MESSAGES = "chat_messages"
SEARCH_HISTORY = "search_history"
SAVED_RESULTS = "saved_results"


@lru_cache
def get_client() -> MongoClient:
    settings = get_settings()
    return MongoClient(
        settings.mongodb_uri,
        serverSelectionTimeoutMS=settings.mongodb_timeout_ms,
        connectTimeoutMS=settings.mongodb_timeout_ms,
        tz_aware=True,
        appname=settings.app_name,
    )


def get_database() -> Database:
    """FastAPI-friendly accessor for the application database."""
    return get_client()[get_settings().mongodb_db_name]


def ping() -> None:
    """Raise if the server is unreachable (used at startup for a clear error)."""
    get_client().admin.command("ping")


def init_indexes() -> None:
    """Create the indexes the app relies on. Idempotent."""
    db = get_database()
    db[USERS].create_index([("email", ASCENDING)], unique=True, name="uniq_email")
    db[DOCUMENTS].create_index([("owner_id", ASCENDING)], name="owner")
    db[DOCUMENTS].create_index([("owner_id", ASCENDING), ("sha256", ASCENDING)], name="owner_sha")
    db[CHUNKS].create_index([("document_id", ASCENDING)], name="doc")
    db[CHAT_SESSIONS].create_index(
        [("owner_id", ASCENDING), ("updated_at", DESCENDING)], name="owner_recent"
    )
    db[CHAT_MESSAGES].create_index(
        [("session_id", ASCENDING), ("created_at", ASCENDING)], name="session_order"
    )
    db[SEARCH_HISTORY].create_index(
        [("owner_id", ASCENDING), ("created_at", DESCENDING)], name="owner_recent"
    )
    db[SAVED_RESULTS].create_index(
        [("owner_id", ASCENDING), ("created_at", DESCENDING)], name="owner_recent"
    )
    db[SAVED_RESULTS].create_index(
        [("owner_id", ASCENDING), ("url", ASCENDING)], name="owner_url"
    )
    logger.info("MongoDB indexes ensured on '%s'", get_settings().mongodb_db_name)


def close() -> None:
    get_client().close()
    get_client.cache_clear()
