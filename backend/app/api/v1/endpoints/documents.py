"""Document management endpoints (Phase 2)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import (
    CurrentUser,
    get_chunk_repo,
    get_chunk_retriever,
    get_document_indexer,
    get_document_repo,
)
from app.core.exceptions import NotFoundError
from app.db.models import Document
from app.db.repositories import ChunkRepository, DocumentRepository
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
Documents = Annotated[DocumentRepository, Depends(get_document_repo)]
Chunks = Annotated[ChunkRepository, Depends(get_chunk_repo)]


def _owned_document(documents: DocumentRepository, user_id: str, document_id: str) -> Document:
    document = documents.get(user_id, document_id)
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
def list_documents(user: CurrentUser, documents: Documents) -> DocumentListResponse:
    owned = documents.list_by_owner(user.id)
    return DocumentListResponse(
        documents=[DocumentSummary.model_validate(document) for document in owned],
        total=len(owned),
    )


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: str, user: CurrentUser, documents: Documents) -> DocumentDetail:
    return DocumentDetail.model_validate(_owned_document(documents, user.id, document_id))


@router.get(
    "/{document_id}/chunks",
    response_model=DocumentChunksResponse,
    summary="Browse a document's chunks",
    description="Returns chunk text with precise source locations, enabling "
    "navigation from any citation back to the original content.",
)
def get_document_chunks(
    document_id: str, user: CurrentUser, documents: Documents, chunks: Chunks
) -> DocumentChunksResponse:
    document = _owned_document(documents, user.id, document_id)
    rows = chunks.list_for_document(document.id)
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
            for chunk in rows
        ],
        total=len(rows),
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
