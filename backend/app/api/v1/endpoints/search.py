"""Multimodal search endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.deps import get_search_orchestrator
from app.core.config import get_settings
from app.core.exceptions import InvalidInputError
from app.schemas.search import ResultCategory, SearchResponse
from app.services.search.orchestrator import SearchOrchestrator

router = APIRouter(prefix="/search", tags=["Search"])

Orchestrator = Annotated[SearchOrchestrator, Depends(get_search_orchestrator)]


@router.post(
    "",
    response_model=SearchResponse,
    summary="Multimodal search",
    description=(
        "Accepts text, an image, an audio clip, or text combined with a file. "
        "The input is interpreted semantically, live results are retrieved, "
        "re-ranked by meaning, and every result carries a relevance analysis "
        "explaining why it was selected and how confident the system is."
    ),
)
async def search(
    orchestrator: Orchestrator,
    query: Annotated[str | None, Form(max_length=2000)] = None,
    file: Annotated[UploadFile | None, File()] = None,
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
    return orchestrator.search(
        text=query,
        file=file,
        categories=selected,
        limit=limit or get_settings().search_default_limit,
        page=page,
    )
