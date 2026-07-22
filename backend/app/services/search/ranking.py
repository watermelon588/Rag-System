"""Hybrid re-ranking of provider results.

Each candidate is scored by a weighted blend of up to four signals:

- **visual similarity** — cosine between the fused CLIP query vector and the
  CLIP embedding of the result's own thumbnail (image/video results only).
  This is the signal that makes "find things that look like this" real.
- semantic similarity between the query embedding and the result text
- an Okapi BM25 keyword score computed over the candidate set
- the provider's own ordering (a weak prior)

Combining dense (embedding) and sparse (BM25) signals is the standard
hybrid-retrieval recipe; layering CLIP visual similarity on top turns an
image/video query from "search the caption text" into genuine cross-modal
retrieval. Every signal is optional: no CLIP → no visual score, no embedder
→ BM25 fallback (flagged ``degraded``), so the platform always answers.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.logging import get_logger
from app.ml import inference
from app.services.providers.base import ProviderResult
from app.services.search import visual as visual_module
from app.services.search.bm25 import BM25Index

logger = get_logger(__name__)

# Text-mode signal weights (must sum to 1.0 within each mode).
SEMANTIC_WEIGHT = 0.55
KEYWORD_WEIGHT = 0.30
POSITION_WEIGHT = 0.15

DEGRADED_KEYWORD_WEIGHT = 0.70
DEGRADED_POSITION_WEIGHT = 0.30

# Visual-mode weights (a candidate whose thumbnail was embedded).
VISUAL_WEIGHT = 0.55
VISUAL_SEMANTIC_WEIGHT = 0.20
VISUAL_KEYWORD_WEIGHT = 0.15
VISUAL_POSITION_WEIGHT = 0.10

# Visual-mode without a text embedder (CLIP up, MiniLM down).
VISUAL_ONLY_VISUAL_WEIGHT = 0.65
VISUAL_ONLY_KEYWORD_WEIGHT = 0.25
VISUAL_ONLY_POSITION_WEIGHT = 0.10


@dataclass
class ScoredResult:
    result: ProviderResult
    final_score: float
    semantic_score: float | None  # None when embeddings were unavailable
    keyword_score: float          # Okapi BM25, normalised to [0, 1]
    position_score: float
    matched_terms: list[str]
    visual_score: float | None = None  # None when no CLIP query / thumbnail


def _cosine(a: list[float], b: list[float]) -> float:
    # Embeddings are unit-normalised, so the dot product is cosine similarity.
    return sum(x * y for x, y in zip(a, b))


def _position_prior(rank: int) -> float:
    """Provider rank as a decaying prior: 1.0, 0.5, 0.33, ..."""
    return 1.0 / (1.0 + rank)


def rank_results(
    query: str,
    candidates: list[ProviderResult],
    *,
    clip_query: list[float] | None = None,
    visual: bool = False,
) -> tuple[list[ScoredResult], bool]:
    """Score and sort candidates. Returns (scored, degraded).

    When ``visual`` is set and ``clip_query`` is provided, image/video
    thumbnails are downloaded and CLIP-scored against the query vector; those
    candidates are then ranked primarily by visual similarity.
    """
    if not candidates:
        return [], False

    texts = [candidate.text_for_ranking() or "" for candidate in candidates]

    # Sparse signal: BM25 over the candidate set.
    keyword_hits = BM25Index(texts).score_all(query)

    # Dense signal: query/result embedding similarity (optional).
    semantic_scores: list[float | None]
    degraded = False
    try:
        embeddings = inference.embed_texts([query] + texts)
        query_vector, result_vectors = embeddings[0], embeddings[1:]
        semantic_scores = [
            max(0.0, min(1.0, _cosine(query_vector, vector))) for vector in result_vectors
        ]
    except Exception as exc:  # noqa: BLE001 — ranking must degrade, not fail
        logger.warning("Semantic ranking unavailable, using BM25 fallback: %s", exc)
        semantic_scores = [None] * len(candidates)
        degraded = True

    # Visual signal: CLIP thumbnail similarity (optional, image/video only).
    visual_map: dict[int, float] = {}
    if visual and clip_query:
        visual_map = visual_module.visual_scores(clip_query, candidates)

    scored: list[ScoredResult] = []
    for index, (candidate, semantic, keyword) in enumerate(
        zip(candidates, semantic_scores, keyword_hits)
    ):
        position = _position_prior(candidate.provider_rank)
        visual_score = visual_map.get(index)

        final = _blend(semantic, keyword.score, position, visual_score)

        scored.append(
            ScoredResult(
                result=candidate,
                final_score=round(final, 4),
                semantic_score=semantic,
                keyword_score=keyword.score,
                position_score=round(position, 4),
                matched_terms=keyword.matched_terms,
                visual_score=None if visual_score is None else round(visual_score, 4),
            )
        )

    scored.sort(key=lambda item: item.final_score, reverse=True)
    return scored, degraded


def _blend(
    semantic: float | None,
    keyword: float,
    position: float,
    visual: float | None,
) -> float:
    """Weighted blend, choosing the mix by which signals are available."""
    if visual is not None:
        if semantic is not None:
            return (
                VISUAL_WEIGHT * visual
                + VISUAL_SEMANTIC_WEIGHT * semantic
                + VISUAL_KEYWORD_WEIGHT * keyword
                + VISUAL_POSITION_WEIGHT * position
            )
        return (
            VISUAL_ONLY_VISUAL_WEIGHT * visual
            + VISUAL_ONLY_KEYWORD_WEIGHT * keyword
            + VISUAL_ONLY_POSITION_WEIGHT * position
        )
    if semantic is not None:
        return (
            SEMANTIC_WEIGHT * semantic
            + KEYWORD_WEIGHT * keyword
            + POSITION_WEIGHT * position
        )
    return DEGRADED_KEYWORD_WEIGHT * keyword + DEGRADED_POSITION_WEIGHT * position
