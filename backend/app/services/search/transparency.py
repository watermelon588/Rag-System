"""Result transparency: turn raw ranking scores into signals, confidence
levels and human-readable explanations."""

from __future__ import annotations

from app.schemas.search import (
    ConfidenceLevel,
    RelevanceAnalysis,
    RelevanceSignal,
    ResultCategory,
    SearchResultItem,
)
from app.services.search.ranking import (
    DEGRADED_KEYWORD_WEIGHT,
    DEGRADED_POSITION_WEIGHT,
    KEYWORD_WEIGHT,
    POSITION_WEIGHT,
    SEMANTIC_WEIGHT,
    ScoredResult,
)

_HIGH_THRESHOLD = 0.62
_MEDIUM_THRESHOLD = 0.38


def confidence_for(score: float) -> ConfidenceLevel:
    if score >= _HIGH_THRESHOLD:
        return ConfidenceLevel.HIGH
    if score >= _MEDIUM_THRESHOLD:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW


def _describe_semantic(score: float) -> str:
    if score >= 0.7:
        return "Content is a strong semantic match for the query's meaning"
    if score >= 0.45:
        return "Content is topically related to the query"
    return "Content shares limited meaning with the query"


def _describe_keyword(score: float, matched: list[str]) -> str:
    if not matched:
        return "No key query terms appear directly in this result"
    shown = ", ".join(matched[:5])
    strength = "strong" if score >= 0.7 else "partial" if score >= 0.3 else "weak"
    return f"{strength.capitalize()} keyword (BM25) match on: {shown}"


def _describe_position(rank: int) -> str:
    return f"Ranked #{rank + 1} by the upstream search provider"


def build_analysis(item: ScoredResult) -> RelevanceAnalysis:
    signals: list[RelevanceSignal] = []

    if item.semantic_score is not None:
        signals.append(
            RelevanceSignal(
                name="semantic_similarity",
                score=round(item.semantic_score, 4),
                weight=SEMANTIC_WEIGHT,
                explanation=_describe_semantic(item.semantic_score),
            )
        )
        keyword_weight, position_weight = KEYWORD_WEIGHT, POSITION_WEIGHT
    else:
        keyword_weight, position_weight = DEGRADED_KEYWORD_WEIGHT, DEGRADED_POSITION_WEIGHT

    signals.append(
        RelevanceSignal(
            name="bm25_keyword",
            score=item.keyword_score,
            weight=keyword_weight,
            explanation=_describe_keyword(item.keyword_score, item.matched_terms),
        )
    )
    signals.append(
        RelevanceSignal(
            name="provider_position",
            score=item.position_score,
            weight=position_weight,
            explanation=_describe_position(item.result.provider_rank),
        )
    )

    confidence = confidence_for(item.final_score)
    strongest = max(signals, key=lambda signal: signal.score * signal.weight)
    explanation = (
        f"Overall relevance {item.final_score:.0%} ({confidence.value} confidence). "
        f"Primary factor: {strongest.explanation.lower()}."
    )

    return RelevanceAnalysis(
        relevance_score=min(1.0, item.final_score),
        confidence=confidence,
        signals=signals,
        explanation=explanation,
        matched_terms=item.matched_terms,
    )


def to_result_item(item: ScoredResult, rank: int) -> SearchResultItem:
    raw = item.result
    return SearchResultItem(
        category=raw.category,
        rank=rank,
        title=raw.title,
        url=raw.url,
        snippet=raw.snippet,
        source=raw.source,
        thumbnail_url=raw.thumbnail_url,
        image_url=raw.image_url,
        date=raw.date,
        analysis=build_analysis(item),
    )


def overall_confidence(
    results: dict[ResultCategory, list[SearchResultItem]]
) -> tuple[ConfidenceLevel, str]:
    """Aggregate confidence plus a one-paragraph quality summary."""
    all_items = [item for items in results.values() for item in items]
    if not all_items:
        return ConfidenceLevel.LOW, "No results were retrieved for this query."

    scores = [item.analysis.relevance_score for item in all_items]
    top = sorted(scores, reverse=True)[: min(5, len(scores))]
    mean_top = sum(top) / len(top)
    confidence = confidence_for(mean_top)

    high = sum(1 for score in scores if score >= _HIGH_THRESHOLD)
    counts = ", ".join(
        f"{len(items)} {category.value}" for category, items in results.items() if items
    )
    summary = (
        f"Retrieved {len(all_items)} results ({counts}). "
        f"{high} are strong matches; the top results average {mean_top:.0%} relevance, "
        f"giving {confidence.value} overall confidence."
    )
    return confidence, summary
