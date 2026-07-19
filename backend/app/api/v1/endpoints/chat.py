"""Document chat endpoints (Phase 2)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_chat_service
from app.schemas.chat import (
    AskRequest,
    AskResponse,
    ChatMessageOut,
    ChatSessionCreate,
    ChatSessionDetail,
    ChatSessionListResponse,
    ChatSessionSummary,
)
from app.services.rag.chat import DocumentChatService

router = APIRouter(prefix="/chat", tags=["Document Chat"])

ChatSvc = Annotated[DocumentChatService, Depends(get_chat_service)]


@router.post("/sessions", response_model=ChatSessionSummary, status_code=201)
def create_session(
    body: ChatSessionCreate, user: CurrentUser, chat: ChatSvc
) -> ChatSessionSummary:
    session = chat.create_session(user.id, body.title, body.document_ids)
    return ChatSessionSummary.model_validate(session)


@router.get("/sessions", response_model=ChatSessionListResponse)
def list_sessions(user: CurrentUser, chat: ChatSvc) -> ChatSessionListResponse:
    sessions = chat.list_sessions(user.id)
    return ChatSessionListResponse(
        sessions=[ChatSessionSummary.model_validate(session) for session in sessions],
        total=len(sessions),
    )


@router.get("/sessions/{session_id}", response_model=ChatSessionDetail)
def get_session(session_id: str, user: CurrentUser, chat: ChatSvc) -> ChatSessionDetail:
    session = chat.get_session(user.id, session_id)
    return ChatSessionDetail(
        **ChatSessionSummary.model_validate(session).model_dump(),
        messages=[ChatMessageOut.model_validate(message) for message in session.messages],
    )


@router.post(
    "/sessions/{session_id}/ask",
    response_model=AskResponse,
    summary="Ask a question about your documents",
    description=(
        "Retrieves the most relevant document chunks, generates an answer "
        "grounded in them, and returns citations pointing at the exact "
        "source locations (page, section, lines). Optionally augments weak "
        "document context with live web search."
    ),
)
def ask(
    session_id: str, body: AskRequest, user: CurrentUser, chat: ChatSvc
) -> AskResponse:
    return chat.ask(user.id, session_id, body.question, body.use_web_search)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, user: CurrentUser, chat: ChatSvc) -> None:
    chat.delete_session(user.id, session_id)
