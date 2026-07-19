"""Chunk retrieval for RAG.

Semantic search over the vector store, scoped to the requesting user's
documents (optionally a subset), joined back to chunk metadata so every
hit carries its precise source location.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.db.models import Document, DocumentChunk
from app.ml import inference
from app.schemas.documents import ChunkLocation
from app.services.vector import get_document_store


@dataclass
class RetrievedChunk:
    chunk_id: str
    text: str
    similarity: float
    location: ChunkLocation


class ChunkRetriever:
    def __init__(self, db: Session):
        self._db = db

    def _scoped_documents(
        self, owner_id: str, document_ids: list[str] | None
    ) -> list[Document]:
        query = self._db.query(Document).filter(
            Document.owner_id == owner_id, Document.status == "ready"
        )
        if document_ids:
            query = query.filter(Document.id.in_(document_ids))
        documents = query.all()
        if document_ids and len(documents) != len(set(document_ids)):
            found = {document.id for document in documents}
            missing = [doc_id for doc_id in document_ids if doc_id not in found]
            raise NotFoundError(
                "Some requested documents were not found or are not ready",
                details={"missing_document_ids": missing},
            )
        return documents

    def retrieve(
        self,
        owner_id: str,
        query: str,
        *,
        document_ids: list[str] | None = None,
        top_k: int = 6,
    ) -> list[RetrievedChunk]:
        documents = self._scoped_documents(owner_id, document_ids)
        if not documents:
            return []
        names = {document.id: document.filename for document in documents}

        allowed_ids = {
            chunk_id
            for (chunk_id,) in self._db.query(DocumentChunk.id).filter(
                DocumentChunk.document_id.in_(names.keys())
            )
        }
        if not allowed_ids:
            return []

        query_vector = inference.embed_text(query)
        hits = get_document_store().search(query_vector, top_k, allowed_ids=allowed_ids)
        if not hits:
            return []

        rows = {
            row.id: row
            for row in self._db.query(DocumentChunk).filter(
                DocumentChunk.id.in_([hit.id for hit in hits])
            )
        }

        retrieved = []
        for hit in hits:
            row = rows.get(hit.id)
            if row is None:
                continue
            retrieved.append(
                RetrievedChunk(
                    chunk_id=row.id,
                    text=row.text,
                    similarity=hit.score,
                    location=ChunkLocation(
                        document_id=row.document_id,
                        document_name=names.get(row.document_id, "unknown"),
                        chunk_id=row.id,
                        ordinal=row.ordinal,
                        page_number=row.page_number,
                        section=row.section,
                        line_start=row.line_start,
                        line_end=row.line_end,
                        char_start=row.char_start,
                        char_end=row.char_end,
                    ),
                )
            )
        return retrieved
