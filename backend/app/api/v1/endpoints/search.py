"""Multimodal search endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.deps import (
    OptionalUser,
    get_search_history_repo,
    get_search_orchestrator,
)
from app.core.config import get_settings
from app.core.exceptions import InvalidInputError
from app.db.repositories import SearchHistoryRepository
from app.schemas.search import ResultCategory, SearchResponse
from app.services.search.orchestrator import SearchOrchestrator

router = APIRouter(prefix="/search", tags=["Search"])

Orchestrator = Annotated[SearchOrchestrator, Depends(get_search_orchestrator)]
HistoryRepo = Annotated[SearchHistoryRepository, Depends(get_search_history_repo)]


@router.post(
    "",
    response_model=SearchResponse,
    summary="Multimodal search",
    description=(
        "Accepts text and/or any combination of files (images, audio, video). "
        "All inputs are fused into a single CLIP cross-modal query vector plus a "
        "keyword query; live results are retrieved, image/video results are "
        "re-ranked by genuine visual similarity, and every result carries a "
        "relevance analysis explaining why it was selected."
    ),
)
async def search(
    orchestrator: Orchestrator,
    optional_user: OptionalUser,
    history: HistoryRepo,
    query: Annotated[str | None, Form(max_length=2000)] = None,
    files: Annotated[list[UploadFile] | None, File()] = None,
    categories: Annotated[
        str | None,
        Form(description="Comma-separated subset of: web,images,videos,news"),
    ] = None,
    limit: Annotated[int | None, Form(ge=1, le=20)] = None,
    page: Annotated[int, Form(ge=1, le=20, description="1-based results page")] = 1,
) -> SearchResponse:
    selected: list[ResultCategory] | None = None
    if categories:
        try:
            selected = [
                ResultCategory(part.strip().lower())
                for part in categories.split(",")
                if part.strip()
            ]
        except ValueError as exc:
            valid = ", ".join(category.value for category in ResultCategory)
            raise InvalidInputError(f"Invalid category. Valid values: {valid}") from exc

    response = orchestrator.search(
        text=query,
        files=files,
        categories=selected,
        limit=limit or get_settings().search_default_limit,
        page=page,
    )

    # Record history for signed-in users (first page only, best-effort).
    if optional_user is not None and page == 1:
        try:
            history.add(
                optional_user.id,
                query_text=response.interpretation.interpreted_query,
                modality=response.interpretation.modality.value,
                result_count=response.metadata.total_results,
            )
        except Exception:  # noqa: BLE001 — history must never break search
            pass

    return response
