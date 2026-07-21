"""MongoDB repositories.

Each repository owns one collection and returns domain dataclasses (never
raw Mongo documents), keeping BSON/`_id` concerns out of the service layer.
Identifiers are opaque UUID-hex strings stored as ``_id``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pymongo.database import Database

from app.db import mongo
from app.db.models import (
    ChatMessage,
    ChatSession,
    Document,
    DocumentChunk,
    User,
    new_id,
    utcnow,
)


def _strip_id(raw: dict) -> dict:
    """Map a Mongo document's ``_id`` onto ``id``."""
    if raw is None:
        return raw
    data = dict(raw)
    data["id"] = data.pop("_id")
    return data


# ------------------------------------------------------------------- users

class UserRepository:
    def __init__(self, db: Database):
        self._col = db[mongo.USERS]

    def create(self, email: str, display_name: str, password_hash: str) -> User:
        doc = {
            "_id": new_id(),
            "email": email,
            "display_name": display_name,
            "password_hash": password_hash,
            "created_at": utcnow(),
        }
        self._col.insert_one(doc)
        return User(**_strip_id(doc))

    def get_by_email(self, email: str) -> User | None:
        raw = self._col.find_one({"email": email})
        return User(**_strip_id(raw)) if raw else None

    def get_by_id(self, user_id: str) -> User | None:
        raw = self._col.find_one({"_id": user_id})
        return User(**_strip_id(raw)) if raw else None


# --------------------------------------------------------------- documents

class DocumentRepository:
    def __init__(self, db: Database):
        self._col = db[mongo.DOCUMENTS]

    def create(self, document: Document) -> Document:
        doc = _to_mongo(document)
        self._col.insert_one(doc)
        return document

    def get(self, owner_id: str, document_id: str) -> Document | None:
        raw = self._col.find_one({"_id": document_id, "owner_id": owner_id})
        return Document(**_strip_id(raw)) if raw else None

    def find_by_hash(self, owner_id: str, sha256: str) -> Document | None:
        raw = self._col.find_one({"owner_id": owner_id, "sha256": sha256})
        return Document(**_strip_id(raw)) if raw else None

    def list_by_owner(self, owner_id: str) -> list[Document]:
        cursor = self._col.find({"owner_id": owner_id}).sort("created_at", -1)
        return [Document(**_strip_id(raw)) for raw in cursor]

    def list_ready(self, owner_id: str, document_ids: list[str] | None = None) -> list[Document]:
        query: dict[str, Any] = {"owner_id": owner_id, "status": "ready"}
        if document_ids:
            query["_id"] = {"$in": document_ids}
        return [Document(**_strip_id(raw)) for raw in self._col.find(query)]

    def update(self, document_id: str, fields: dict) -> None:
        self._col.update_one({"_id": document_id}, {"$set": fields})

    def delete(self, document_id: str) -> None:
        self._col.delete_one({"_id": document_id})

    def path_in_use(self, stored_path: str, exclude_id: str) -> bool:
        return (
            self._col.find_one({"stored_path": stored_path, "_id": {"$ne": exclude_id}})
            is not None
        )


# ------------------------------------------------------------------ chunks

class ChunkRepository:
    def __init__(self, db: Database):
        self._col = db[mongo.CHUNKS]

    def insert_many(self, chunks: list[DocumentChunk]) -> None:
        if not chunks:
            return
        self._col.insert_many([_to_mongo(chunk) for chunk in chunks])

    def ids_for_documents(self, document_ids: list[str]) -> set[str]:
        cursor = self._col.find({"document_id": {"$in": document_ids}}, {"_id": 1})
        return {raw["_id"] for raw in cursor}

    def get_many(self, chunk_ids: list[str]) -> dict[str, DocumentChunk]:
        cursor = self._col.find({"_id": {"$in": chunk_ids}})
        return {raw["_id"]: DocumentChunk(**_strip_id(raw)) for raw in cursor}

    def list_for_document(self, document_id: str) -> list[DocumentChunk]:
        cursor = self._col.find({"document_id": document_id}).sort("ordinal", 1)
        return [DocumentChunk(**_strip_id(raw)) for raw in cursor]

    def delete_for_document(self, document_id: str) -> None:
        self._col.delete_many({"document_id": document_id})


# ----------------------------------------------------------- chat sessions

class ChatRepository:
    def __init__(self, db: Database):
        self._sessions = db[mongo.CHAT_SESSIONS]
        self._messages = db[mongo.CHAT_MESSAGES]

    # sessions -------------------------------------------------------------

    def create_session(self, owner_id: str, title: str, document_ids: list[str] | None) -> ChatSession:
        now = utcnow()
        session = ChatSession(
            id=new_id(),
            owner_id=owner_id,
            title=title,
            document_ids=document_ids,
            created_at=now,
            updated_at=now,
        )
        self._sessions.insert_one(_to_mongo(session))
        return session

    def get_session(self, owner_id: str, session_id: str) -> ChatSession | None:
        raw = self._sessions.find_one({"_id": session_id, "owner_id": owner_id})
        return ChatSession(**_strip_id(raw)) if raw else None

    def list_sessions(self, owner_id: str) -> list[ChatSession]:
        cursor = self._sessions.find({"owner_id": owner_id}).sort("updated_at", -1)
        return [ChatSession(**_strip_id(raw)) for raw in cursor]

    def update_session(self, session_id: str, fields: dict) -> None:
        self._sessions.update_one({"_id": session_id}, {"$set": fields})

    def touch_session(self, session_id: str) -> None:
        self._sessions.update_one({"_id": session_id}, {"$set": {"updated_at": utcnow()}})

    def delete_session(self, session_id: str) -> None:
        self._sessions.delete_one({"_id": session_id})
        self._messages.delete_many({"session_id": session_id})

    # messages -------------------------------------------------------------

    def add_message(self, message: ChatMessage) -> ChatMessage:
        self._messages.insert_one(_to_mongo(message))
        return message

    def list_messages(self, session_id: str) -> list[ChatMessage]:
        cursor = self._messages.find({"session_id": session_id}).sort("created_at", 1)
        return [ChatMessage(**_strip_id(raw)) for raw in cursor]

    def recent_messages(self, session_id: str, limit: int) -> list[ChatMessage]:
        messages = self.list_messages(session_id)
        return messages[-limit:] if limit else messages


# ------------------------------------------------------------------ helpers

def _to_mongo(obj: Any) -> dict:
    """Serialise a domain dataclass to a Mongo document (``id`` → ``_id``)."""
    from dataclasses import asdict

    data = asdict(obj)
    data["_id"] = data.pop("id")
    return data


def _isoformat(value: datetime) -> str:  # kept for potential API-layer reuse
    return value.isoformat()
