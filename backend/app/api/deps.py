"""Shared FastAPI dependencies: database, repositories, current user and
service wiring. Endpoints receive fully constructed services and never
instantiate infrastructure themselves.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo.database import Database

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError
from app.core.security import decode_token
from app.db.models import User
from app.db.mongo import get_database
from app.db.repositories import (
    ChatRepository,
    ChunkRepository,
    DocumentRepository,
    UserRepository,
)
from app.services.auth import AuthService
from app.services.providers import SerperProvider
from app.services.providers.base import SearchProvider
from app.services.rag.chat import DocumentChatService
from app.services.rag.indexer import DocumentIndexer
from app.services.rag.retriever import ChunkRetriever
from app.services.search.orchestrator import SearchOrchestrator

_bearer = HTTPBearer(auto_error=False)


def get_db() -> Database:
    return get_database()


Db = Annotated[Database, Depends(get_db)]


# --------------------------------------------------------------- repositories

def get_user_repo(db: Db) -> UserRepository:
    return UserRepository(db)


def get_document_repo(db: Db) -> DocumentRepository:
    return DocumentRepository(db)


def get_chunk_repo(db: Db) -> ChunkRepository:
    return ChunkRepository(db)


def get_chat_repo(db: Db) -> ChatRepository:
    return ChatRepository(db)


# ----------------------------------------------------------------- current user

def get_current_user(
    request: Request,
    users: Annotated[UserRepository, Depends(get_user_repo)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    # Prefer the httpOnly access cookie; fall back to a Bearer header (useful
    # for API clients / tooling).
    settings = get_settings()
    token = request.cookies.get(settings.access_cookie_name)
    if not token and credentials is not None:
        token = credentials.credentials
    if not token:
        raise AuthenticationError("Missing authentication token")

    payload = decode_token(token)
    user = users.get_by_id(payload["sub"])
    if user is None:
        raise AuthenticationError("Account no longer exists")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


# -------------------------------------------------------------------- services

def get_search_provider() -> SearchProvider:
    return SerperProvider()


def get_auth_service(users: Annotated[UserRepository, Depends(get_user_repo)]) -> AuthService:
    return AuthService(users)


def get_search_orchestrator(
    provider: Annotated[SearchProvider, Depends(get_search_provider)],
) -> SearchOrchestrator:
    return SearchOrchestrator(provider)


def get_document_indexer(
    documents: Annotated[DocumentRepository, Depends(get_document_repo)],
    chunks: Annotated[ChunkRepository, Depends(get_chunk_repo)],
) -> DocumentIndexer:
    return DocumentIndexer(documents, chunks)


def get_chunk_retriever(
    documents: Annotated[DocumentRepository, Depends(get_document_repo)],
    chunks: Annotated[ChunkRepository, Depends(get_chunk_repo)],
) -> ChunkRetriever:
    return ChunkRetriever(documents, chunks)


def get_chat_service(
    chat: Annotated[ChatRepository, Depends(get_chat_repo)],
    retriever: Annotated[ChunkRetriever, Depends(get_chunk_retriever)],
    provider: Annotated[SearchProvider, Depends(get_search_provider)],
) -> DocumentChatService:
    return DocumentChatService(chat, retriever, web_provider=provider)
