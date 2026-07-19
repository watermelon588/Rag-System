"""Document management endpoints (Phase 2)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import CurrentUser, DbSession, get_chunk_retriever, get_document_indexer
from app.core.exceptions import NotFoundError
from app.db.models import Document, DocumentChunk
from app.schemas.documents import (
    ChunkLocation,
    DocumentChunkPreview,
    DocumentChunksResponse,
    DocumentDeleteResponse,
    DocumentDetail,
    DocumentListResponse,
    DocumentSearchRequest,
    DocumentSummary,
)
from app.services.rag.indexer import DocumentIndexer
from app.services.rag.retriever import ChunkRetriever

router = APIRouter(prefix="/documents", tags=["Documents"])

Indexer = Annotated[DocumentIndexer, Depends(get_document_indexer)]
Retriever = Annotated[ChunkRetriever, Depends(get_chunk_retriever)]


def _owned_document(db: DbSession, user_id: str, document_id: str) -> Document:
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.owner_id == user_id)
        .first()
    )
    if document is None:
        raise NotFoundError("Document not found")
    return document


@router.post("", response_model=DocumentDetail, status_code=201, summary="Upload a document")
async def upload_document(
    user: CurrentUser, indexer: Indexer, file: Annotated[UploadFile, File()]
) -> DocumentDetail:
    document = indexer.ingest(user.id, file)
    return DocumentDetail.model_validate(document)


@router.get("", response_model=DocumentListResponse)
def list_documents(user: CurrentUser, db: DbSession) -> DocumentListResponse:
    documents = (
        db.query(Document)
        .filter(Document.owner_id == user.id)
        .order_by(Document.created_at.desc())
        .all()
    )
    return DocumentListResponse(
        documents=[DocumentSummary.model_validate(document) for document in documents],
        total=len(documents),
    )


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: str, user: CurrentUser, db: DbSession) -> DocumentDetail:
    return DocumentDetail.model_validate(_owned_document(db, user.id, document_id))


@router.get(
    "/{document_id}/chunks",
    response_model=DocumentChunksResponse,
    summary="Browse a document's chunks",
    description="Returns chunk text with precise source locations, enabling "
    "navigation from any citation back to the original content.",
)
def get_document_chunks(
    document_id: str, user: CurrentUser, db: DbSession
) -> DocumentChunksResponse:
    document = _owned_document(db, user.id, document_id)
    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document.id)
        .order_by(DocumentChunk.ordinal)
        .all()
    )
    return DocumentChunksResponse(
        document_id=document.id,
        chunks=[
            DocumentChunkPreview(
                location=ChunkLocation(
                    document_id=document.id,
                    document_name=document.filename,
                    chunk_id=chunk.id,
                    ordinal=chunk.ordinal,
                    page_number=chunk.page_number,
                    section=chunk.section,
                    line_start=chunk.line_start,
                    line_end=chunk.line_end,
                    char_start=chunk.char_start,
                    char_end=chunk.char_end,
                ),
                text=chunk.text,
            )
            for chunk in chunks
        ],
        total=len(chunks),
    )


@router.post(
    "/query",
    response_model=list[DocumentChunkPreview],
    summary="Semantic search inside your documents",
)
def query_documents(
    body: DocumentSearchRequest, user: CurrentUser, retriever: Retriever
) -> list[DocumentChunkPreview]:
    retrieved = retriever.retrieve(
        user.id, body.query, document_ids=body.document_ids, top_k=body.top_k
    )
    return [
        DocumentChunkPreview(location=chunk.location, text=chunk.text)
        for chunk in retrieved
    ]


@router.delete("/{document_id}", response_model=DocumentDeleteResponse)
def delete_document(
    document_id: str, user: CurrentUser, indexer: Indexer
) -> DocumentDeleteResponse:
    indexer.delete(user.id, document_id)
    return DocumentDeleteResponse(id=document_id)
