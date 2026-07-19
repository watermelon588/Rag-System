"""Document management schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DocumentSummary(BaseModel):
    id: str
    filename: str
    format: str
    size_bytes: int
    status: str
    page_count: int | None = None
    chunk_count: int
    created_at: datetime
    error: str | None = None

    model_config = {"from_attributes": True}


class DocumentDetail(DocumentSummary):
    content_type: str
    doc_metadata: dict | None = None


class DocumentListResponse(BaseModel):
    documents: list[DocumentSummary]
    total: int


class ChunkLocation(BaseModel):
    """Precise location of a chunk inside its source document, enabling
    click-through navigation back to the original content."""

    document_id: str
    document_name: str
    chunk_id: str
    ordinal: int
    page_number: int | None = None
    section: str | None = None
    line_start: int | None = None
    line_end: int | None = None
    char_start: int | None = None
    char_end: int | None = None


class DocumentChunkPreview(BaseModel):
    location: ChunkLocation
    text: str


class DocumentChunksResponse(BaseModel):
    document_id: str
    chunks: list[DocumentChunkPreview]
    total: int


class DocumentDeleteResponse(BaseModel):
    id: str
    deleted: bool = True


class DocumentSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    document_ids: list[str] | None = None
    top_k: int = Field(default=6, ge=1, le=25)
