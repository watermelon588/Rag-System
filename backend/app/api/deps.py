"""Shared FastAPI dependencies: database session, authenticated user and
service wiring. Endpoints receive fully constructed services and never
instantiate infrastructure themselves.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import AuthenticationError
from app.core.security import decode_token
from app.db.models import User
from app.db.session import get_db
from app.services.auth import AuthService
from app.services.providers import SerperProvider
from app.services.providers.base import SearchProvider
from app.services.rag.chat import DocumentChatService
from app.services.rag.indexer import DocumentIndexer
from app.services.rag.retriever import ChunkRetriever
from app.services.search.orchestrator import SearchOrchestrator

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise AuthenticationError("Missing authentication token")
    payload = decode_token(credentials.credentials)
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if user is None:
        raise AuthenticationError("Account no longer exists")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_search_provider() -> SearchProvider:
    return SerperProvider()


def get_auth_service(db: DbSession) -> AuthService:
    return AuthService(db)


def get_search_orchestrator(
    provider: Annotated[SearchProvider, Depends(get_search_provider)],
) -> SearchOrchestrator:
    return SearchOrchestrator(provider)


def get_document_indexer(db: DbSession) -> DocumentIndexer:
    return DocumentIndexer(db)


def get_chunk_retriever(db: DbSession) -> ChunkRetriever:
    return ChunkRetriever(db)


def get_chat_service(
    db: DbSession,
    provider: Annotated[SearchProvider, Depends(get_search_provider)],
) -> DocumentChatService:
    return DocumentChatService(db, web_provider=provider)
