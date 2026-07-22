"""Search pipeline orchestrator.

Owns the stage sequence and timing; each stage lives in its own module
so stages can evolve (or be swapped) independently.
"""

from __future__ import annotations

import time

from fastapi import UploadFile

from app.core.logging import get_logger
from app.schemas.search import (
    PipelineStage,
    ResultCategory,
    SearchMetadata,
    SearchResponse,
    SearchResultItem,
)
from app.services.providers.base import SearchProvider
from app.services.search import multimodal, transparency, understanding
from app.services.search.ranking import rank_results

logger = get_logger(__name__)

ALL_CATEGORIES = [
    ResultCategory.WEB,
    ResultCategory.IMAGES,
    ResultCategory.VIDEOS,
    ResultCategory.NEWS,
]

# Categories whose results carry a real thumbnail worth CLIP-scoring.
_VISUAL_CATEGORIES = {ResultCategory.IMAGES, ResultCategory.VIDEOS}


class _StageTimer:
    def __init__(self) -> None:
        self.stages: list[PipelineStage] = []

    def record(self, name: str, started: float, status: str = "completed", detail: str | None = None):
        self.stages.append(
            PipelineStage(
                name=name,
                status=status,
                duration_ms=round((time.perf_counter() - started) * 1000, 1),
                detail=detail,
            )
        )


class SearchOrchestrator:
    def __init__(self, provider: SearchProvider):
        self._provider = provider

    def search(
        self,
        *,
        text: str | None,
        files: list[UploadFile] | None = None,
        categories: list[ResultCategory] | None = None,
        limit: int = 10,
        page: int = 1,
    ) -> SearchResponse:
        timer = _StageTimer()
        pipeline_start = time.perf_counter()
        categories = categories or ALL_CATEGORIES
        page = max(1, page)

        # Fail fast before any (potentially expensive) model work.
        if not self._provider.is_configured():
            from app.core.exceptions import ExternalServiceError

            raise ExternalServiceError(
                "Web search provider is not configured (missing SERPER_API_KEY)"
            )

        # Stage 1 — multimodal fusion (build the keyword query + CLIP vector)
        # and query understanding.
        started = time.perf_counter()
        mm_query = multimodal.build(text, files)
        interpretation = understanding.interpret(mm_query)
        clip_query = mm_query.clip_vector
        timer.record(
            "query_understanding",
            started,
            detail=(
                f"{interpretation.modality.value} → '{interpretation.interpreted_query}'"
                + (" (+CLIP vector)" if clip_query else "")
            ),
        )

        # Stage 2 — candidate retrieval from the provider.
        started = time.perf_counter()
        raw_results = self._provider.search(
            interpretation.interpreted_query, categories, limit, page
        )
        total_raw = sum(len(items) for items in raw_results.values())
        # Providers rarely return exactly `limit` items per page (Serper yields
        # ~9 organic results for a requested 10), so treat a near-full page as
        # "more available" rather than requiring an exact match.
        page_threshold = max(1, int(limit * 0.6))
        has_more = any(len(items) >= page_threshold for items in raw_results.values())
        timer.record(
            "retrieval",
            started,
            detail=f"{total_raw} candidates from {self._provider.name} (page {page})",
        )

        # Stage 3 — hybrid re-ranking. Image/video categories additionally get
        # CLIP visual scoring of their thumbnails against the fused query vector.
        started = time.perf_counter()
        degraded = False
        visual_used = False
        ranked: dict[ResultCategory, list[SearchResultItem]] = {}
        for category, candidates in raw_results.items():
            use_visual = bool(clip_query) and category in _VISUAL_CATEGORIES
            scored, category_degraded = rank_results(
                interpretation.interpreted_query,
                candidates,
                clip_query=clip_query if use_visual else None,
                visual=use_visual,
            )
            degraded = degraded or category_degraded
            if use_visual and any(item.visual_score is not None for item in scored):
                visual_used = True
            ranked[category] = [
                transparency.to_result_item(item, rank) for rank, item in enumerate(scored)
            ]
        timer.record(
            "hybrid_ranking",
            started,
            status="degraded" if degraded else "completed",
            detail=(
                "visual + text signals" if visual_used
                else "lexical fallback" if degraded else "text signals"
            ),
        )

        # Stage 4 — aggregate transparency.
        started = time.perf_counter()
        confidence, summary = transparency.overall_confidence(ranked)
        timer.record("transparency_analysis", started)

        return SearchResponse(
            interpretation=interpretation,
            results=ranked,
            overall_confidence=confidence,
            summary=summary,
            metadata=SearchMetadata(
                provider=self._provider.name,
                total_results=sum(len(items) for items in ranked.values()),
                duration_ms=round((time.perf_counter() - pipeline_start) * 1000, 1),
                stages=timer.stages,
                degraded=degraded,
                page=page,
                per_page=limit,
                has_more=has_more,
            ),
        )
