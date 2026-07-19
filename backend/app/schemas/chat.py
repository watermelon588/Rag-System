"""Document chat (RAG) schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.documents import ChunkLocation


class Citation(BaseModel):
    """A grounded reference: which chunk supported the answer, how strongly,
    and exactly where it lives in the source document."""

    marker: int = Field(description="Citation number used inline in the answer, e.g. [1]")
    location: ChunkLocation
    quoted_text: str = Field(description="The supporting passage from the document")
    similarity: float = Field(ge=0.0, le=1.0)


class ChatSessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    document_ids: list[str] | None = Field(
        default=None, description="Restrict the chat to these documents; None = all owned documents"
    )


class ChatSessionSummary(BaseModel):
    id: str
    title: str
    document_ids: list[str] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageOut(BaseModel):
    id: str
    role: str
    content: str
    citations: list[Citation] | None = None
    confidence: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionDetail(ChatSessionSummary):
    messages: list[ChatMessageOut]


class ChatSessionListResponse(BaseModel):
    sessions: list[ChatSessionSummary]
    total: int


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    use_web_search: bool = Field(
        default=False,
        description="Allow augmenting the answer with live web results when document context is weak",
    )


class RetrievalDebug(BaseModel):
    chunks_considered: int
    chunks_used: int
    top_similarity: float
    grounded: bool
    web_augmented: bool = False


class AskResponse(BaseModel):
    session_id: str
    message: ChatMessageOut
    retrieval: RetrievalDebug
    web_results: list[dict] | None = None
