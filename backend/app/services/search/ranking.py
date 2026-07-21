"""Hybrid re-ranking of provider results.

Each candidate is scored by a weighted blend of:

- semantic similarity between the query embedding and the result text
- an Okapi BM25 keyword score computed over the candidate set
- the provider's own ordering (a weak prior)

Combining dense (embedding) and sparse (BM25) signals is the standard
hybrid-retrieval recipe: embeddings capture meaning, BM25 rewards exact
term matches with proper IDF weighting. When the embedding model is
unavailable the ranker leans on BM25 + provider order and flags the
response as degraded, so the platform still answers rather than failing.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.logging import get_logger
from app.ml import inference
from app.services.providers.base import ProviderResult
from app.services.search.bm25 import BM25Index

logger = get_logger(__name__)

# Signal weights (must sum to 1.0 within each mode).
SEMANTIC_WEIGHT = 0.55
KEYWORD_WEIGHT = 0.30
POSITION_WEIGHT = 0.15

DEGRADED_KEYWORD_WEIGHT = 0.70
DEGRADED_POSITION_WEIGHT = 0.30


@dataclass
class ScoredResult:
    result: ProviderResult
    final_score: float
    semantic_score: float | None  # None when embeddings were unavailable
    keyword_score: float          # Okapi BM25, normalised to [0, 1]
    position_score: float
    matched_terms: list[str]


def _cosine(a: list[float], b: list[float]) -> float:
    # Embeddings are unit-normalised, so the dot product is cosine similarity.
    return sum(x * y for x, y in zip(a, b))


def _position_prior(rank: int) -> float:
    """Provider rank as a decaying prior: 1.0, 0.5, 0.33, ..."""
    return 1.0 / (1.0 + rank)


def rank_results(query: str, candidates: list[ProviderResult]) -> tuple[list[ScoredResult], bool]:
    """Score and sort candidates. Returns (scored, degraded)."""
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

    scored: list[ScoredResult] = []
    for candidate, semantic, keyword in zip(candidates, semantic_scores, keyword_hits):
        position = _position_prior(candidate.provider_rank)

        if semantic is None:
            final = DEGRADED_KEYWORD_WEIGHT * keyword.score + DEGRADED_POSITION_WEIGHT * position
        else:
            final = (
                SEMANTIC_WEIGHT * semantic
                + KEYWORD_WEIGHT * keyword.score
                + POSITION_WEIGHT * position
            )

        scored.append(
            ScoredResult(
                result=candidate,
                final_score=round(final, 4),
                semantic_score=semantic,
                keyword_score=keyword.score,
                position_score=round(position, 4),
                matched_terms=keyword.matched_terms,
            )
        )

    scored.sort(key=lambda item: item.final_score, reverse=True)
    return scored, degraded
