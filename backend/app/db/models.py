"""Domain models (plain dataclasses).

These are lightweight, attribute-accessible representations of the records
stored in MongoDB. Repositories map raw Mongo documents (``_id`` →
``id``) onto these, and Pydantic response schemas validate them via
``from_attributes``. They carry no persistence behaviour — all writes go
through the repositories in :mod:`app.db.repositories`.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class User:
    id: str
    email: str
    display_name: str
    password_hash: str
    created_at: datetime


@dataclass
class Document:
    id: str
    owner_id: str
    filename: str
    content_type: str
    format: str
    size_bytes: int
    sha256: str
    stored_path: str
    status: str = "processing"           # processing | ready | failed
    error: str | None = None
    page_count: int | None = None
    chunk_count: int = 0
    doc_metadata: dict | None = None
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class DocumentChunk:
    id: str
    document_id: str
    ordinal: int
    text: str
    page_number: int | None = None
    section: str | None = None
    line_start: int | None = None
    line_end: int | None = None
    char_start: int | None = None
    char_end: int | None = None


@dataclass
class ChatSession:
    id: str
    owner_id: str
    title: str
    document_ids: list[str] | None
    created_at: datetime
    updated_at: datetime


@dataclass
class ChatMessage:
    id: str
    session_id: str
    role: str                            # user | assistant
    content: str
    citations: list | None = None
    confidence: float | None = None
    created_at: datetime = field(default_factory=utcnow)
