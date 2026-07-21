"""Document ingestion: parse → chunk → embed → persist.

Chunk metadata (text + location) is stored in MongoDB; embeddings go to
the vector store keyed by chunk ID. Deletion removes both sides plus the
stored file.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import UploadFile

from app.core.config import get_settings
from app.core.exceptions import ConflictError, DocumentProcessingError, NotFoundError
from app.core.logging import get_logger
from app.db.models import Document, DocumentChunk, new_id
from app.db.repositories import ChunkRepository, DocumentRepository
from app.ml import inference
from app.services.ingestion.uploads import save_upload
from app.services.rag.chunking import build_chunks
from app.services.rag.parsers import DOCUMENT_EXTENSIONS, detect_format, parse_document
from app.services.vector import get_document_store

logger = get_logger(__name__)

_EMBED_BATCH = 64


class DocumentIndexer:
    def __init__(self, documents: DocumentRepository, chunks: ChunkRepository):
        self._documents = documents
        self._chunks = chunks

    def ingest(self, owner_id: str, file: UploadFile) -> Document:
        stored = save_upload(
            file,
            allowed_extensions=DOCUMENT_EXTENSIONS,
            destination=get_settings().document_dir,
        )

        duplicate = self._documents.find_by_hash(owner_id, stored.sha256)
        if duplicate:
            raise ConflictError(
                f"This document was already uploaded as '{duplicate.filename}'",
                details={"document_id": duplicate.id},
            )

        document = Document(
            id=new_id(),
            owner_id=owner_id,
            filename=stored.original_name,
            content_type=stored.content_type,
            format=detect_format(stored.original_name),
            size_bytes=stored.size_bytes,
            sha256=stored.sha256,
            stored_path=str(stored.path),
            status="processing",
        )
        self._documents.create(document)

        try:
            self._index(document, stored.path)
        except Exception as exc:
            document.status = "failed"
            document.error = str(exc)
            self._documents.update(document.id, {"status": "failed", "error": str(exc)})
            logger.warning("Indexing failed for %s: %s", document.filename, exc)
            raise
        return document

    def _index(self, document: Document, path: Path) -> None:
        parsed = parse_document(path, document.filename)
        chunks = build_chunks(parsed)
        if not chunks:
            raise DocumentProcessingError("No extractable text found in the document")

        chunk_rows = [
            DocumentChunk(
                id=new_id(),
                document_id=document.id,
                ordinal=chunk.ordinal,
                text=chunk.text,
                page_number=chunk.page_number,
                section=chunk.section,
                line_start=chunk.line_start,
                line_end=chunk.line_end,
                char_start=chunk.char_start,
                char_end=chunk.char_end,
            )
            for chunk in chunks
        ]
        self._chunks.insert_many(chunk_rows)

        store = get_document_store()
        for start in range(0, len(chunk_rows), _EMBED_BATCH):
            batch = chunk_rows[start : start + _EMBED_BATCH]
            vectors = inference.embed_texts([row.text for row in batch])
            store.add([row.id for row in batch], vectors)

        document.status = "ready"
        document.page_count = parsed.page_count
        document.chunk_count = len(chunk_rows)
        document.doc_metadata = parsed.metadata or None
        self._documents.update(
            document.id,
            {
                "status": "ready",
                "page_count": parsed.page_count,
                "chunk_count": len(chunk_rows),
                "doc_metadata": parsed.metadata or None,
            },
        )
        logger.info(
            "Indexed '%s': %d chunks (%s pages)",
            document.filename,
            len(chunk_rows),
            parsed.page_count or "n/a",
        )

    def delete(self, owner_id: str, document_id: str) -> None:
        document = self._documents.get(owner_id, document_id)
        if document is None:
            raise NotFoundError("Document not found")

        chunk_ids = list(self._chunks.ids_for_documents([document.id]))
        if chunk_ids:
            get_document_store().delete(chunk_ids)
        self._chunks.delete_for_document(document.id)

        stored_path = Path(document.stored_path)
        self._documents.delete(document.id)

        # Only remove the physical file when no other document references the
        # same content hash (uploads are content-deduplicated).
        if not self._documents.path_in_use(str(stored_path), exclude_id=document.id):
            stored_path.unlink(missing_ok=True)
