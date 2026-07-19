"""Semantic re-ranking of provider results.

Each candidate is scored by a weighted blend of:

- semantic similarity between the query embedding and the result text
- lexical overlap with the query's significant terms
- the provider's own ordering (a weak prior)

When the embedding model is unavailable the ranker degrades to the
lexical + provider blend and flags the response as degraded, so the
platform still answers rather than failing.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.logging import get_logger
from app.ml import inference
from app.services.providers.base import ProviderResult
from app.services.search.understanding import significant_terms

logger = get_logger(__name__)

# Signal weights (must sum to 1.0 within each mode).
SEMANTIC_WEIGHT = 0.6
LEXICAL_WEIGHT = 0.25
POSITION_WEIGHT = 0.15

DEGRADED_LEXICAL_WEIGHT = 0.65
DEGRADED_POSITION_WEIGHT = 0.35


@dataclass
class ScoredResult:
    result: ProviderResult
    final_score: float
    semantic_score: float | None  # None when embeddings were unavailable
    lexical_score: float
    position_score: float
    matched_terms: list[str]


def _cosine(a: list[float], b: list[float]) -> float:
    # Embeddings are unit-normalised, so the dot product is cosine similarity.
    return sum(x * y for x, y in zip(a, b))


def _lexical_overlap(query_terms: list[str], text: str) -> tuple[float, list[str]]:
    if not query_terms:
        return 0.0, []
    result_terms = set(significant_terms(text))
    matched = [term for term in query_terms if term in result_terms]
    return len(matched) / len(query_terms), matched


def _position_prior(rank: int) -> float:
    """Provider rank as a decaying prior: 1.0, 0.5, 0.33, ..."""
    return 1.0 / (1.0 + rank)


def rank_results(query: str, candidates: list[ProviderResult]) -> tuple[list[ScoredResult], bool]:
    """Score and sort candidates. Returns (scored, degraded)."""
    if not candidates:
        return [], False

    query_terms = significant_terms(query)

    texts = [candidate.text_for_ranking() or "" for candidate in candidates]
    semantic_scores: list[float | None]
    degraded = False
    try:
        embeddings = inference.embed_texts([query] + texts)
        query_vector, result_vectors = embeddings[0], embeddings[1:]
        semantic_scores = [
            max(0.0, min(1.0, _cosine(query_vector, vector))) for vector in result_vectors
        ]
    except Exception as exc:  # noqa: BLE001 — ranking must degrade, not fail
        logger.warning("Semantic ranking unavailable, using lexical fallback: %s", exc)
        semantic_scores = [None] * len(candidates)
        degraded = True

    scored: list[ScoredResult] = []
    for candidate, semantic in zip(candidates, semantic_scores):
        lexical, matched = _lexical_overlap(query_terms, candidate.text_for_ranking())
        position = _position_prior(candidate.provider_rank)

        if semantic is None:
            final = DEGRADED_LEXICAL_WEIGHT * lexical + DEGRADED_POSITION_WEIGHT * position
        else:
            final = (
                SEMANTIC_WEIGHT * semantic
                + LEXICAL_WEIGHT * lexical
                + POSITION_WEIGHT * position
            )

        scored.append(
            ScoredResult(
                result=candidate,
                final_score=round(final, 4),
                semantic_score=semantic,
                lexical_score=round(lexical, 4),
                position_score=round(position, 4),
                matched_terms=matched,
            )
        )

    scored.sort(key=lambda item: item.final_score, reverse=True)
    return scored, degraded
