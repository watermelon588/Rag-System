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
from app.services.ingestion.modalities import process_search_input
from app.services.providers.base import SearchProvider
from app.services.search import transparency, understanding
from app.services.search.ranking import rank_results

logger = get_logger(__name__)

ALL_CATEGORIES = [
    ResultCategory.WEB,
    ResultCategory.IMAGES,
    ResultCategory.VIDEOS,
    ResultCategory.NEWS,
]


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
        file: UploadFile | None,
        categories: list[ResultCategory] | None = None,
        limit: int = 10,
    ) -> SearchResponse:
        timer = _StageTimer()
        pipeline_start = time.perf_counter()
        categories = categories or ALL_CATEGORIES

        # Fail fast before any (potentially expensive) model work.
        if not self._provider.is_configured():
            from app.core.exceptions import ExternalServiceError

            raise ExternalServiceError(
                "Web search provider is not configured (missing SERPER_API_KEY)"
            )

        # Stage 1 — modality processing + query understanding.
        started = time.perf_counter()
        modality_result = process_search_input(text, file)
        interpretation = understanding.interpret(modality_result)
        timer.record(
            "query_understanding",
            started,
            detail=f"{interpretation.modality.value} → '{interpretation.interpreted_query}'",
        )

        # Stage 2 — candidate retrieval from the provider.
        started = time.perf_counter()
        raw_results = self._provider.search(interpretation.interpreted_query, categories, limit)
        total_raw = sum(len(items) for items in raw_results.values())
        timer.record(
            "retrieval",
            started,
            detail=f"{total_raw} candidates from {self._provider.name}",
        )

        # Stage 3 — semantic re-ranking (per category, single embedding batch each).
        started = time.perf_counter()
        degraded = False
        ranked: dict[ResultCategory, list[SearchResultItem]] = {}
        for category, candidates in raw_results.items():
            scored, category_degraded = rank_results(
                interpretation.interpreted_query, candidates
            )
            degraded = degraded or category_degraded
            ranked[category] = [
                transparency.to_result_item(item, rank) for rank, item in enumerate(scored)
            ]
        timer.record(
            "semantic_ranking",
            started,
            status="degraded" if degraded else "completed",
            detail="lexical fallback" if degraded else None,
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
            ),
        )
