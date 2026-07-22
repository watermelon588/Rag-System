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
    VISUAL_KEYWORD_WEIGHT,
    VISUAL_ONLY_KEYWORD_WEIGHT,
    VISUAL_ONLY_POSITION_WEIGHT,
    VISUAL_ONLY_VISUAL_WEIGHT,
    VISUAL_POSITION_WEIGHT,
    VISUAL_SEMANTIC_WEIGHT,
    VISUAL_WEIGHT,
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


def _describe_visual(score: float) -> str:
    if score >= 0.7:
        return "Closely matches the visual content of your uploaded media"
    if score >= 0.4:
        return "Shares visual features with your uploaded media"
    return "Loosely resembles your uploaded media"


def build_analysis(item: ScoredResult) -> RelevanceAnalysis:
    signals: list[RelevanceSignal] = []
    has_visual = item.visual_score is not None
    has_semantic = item.semantic_score is not None

    # Select the weight mix the ranker actually applied, so the reported
    # weights always reconstruct the final score.
    if has_visual:
        semantic_weight = VISUAL_SEMANTIC_WEIGHT
        keyword_weight = VISUAL_KEYWORD_WEIGHT if has_semantic else VISUAL_ONLY_KEYWORD_WEIGHT
        position_weight = VISUAL_POSITION_WEIGHT if has_semantic else VISUAL_ONLY_POSITION_WEIGHT
        visual_weight = VISUAL_WEIGHT if has_semantic else VISUAL_ONLY_VISUAL_WEIGHT
        signals.append(
            RelevanceSignal(
                name="visual_similarity",
                score=round(item.visual_score, 4),
                weight=visual_weight,
                explanation=_describe_visual(item.visual_score),
            )
        )
    elif has_semantic:
        semantic_weight, keyword_weight, position_weight = (
            SEMANTIC_WEIGHT, KEYWORD_WEIGHT, POSITION_WEIGHT,
        )
    else:
        semantic_weight = 0.0
        keyword_weight, position_weight = DEGRADED_KEYWORD_WEIGHT, DEGRADED_POSITION_WEIGHT

    if has_semantic:
        signals.append(
            RelevanceSignal(
                name="semantic_similarity",
                score=round(item.semantic_score, 4),
                weight=semantic_weight,
                explanation=_describe_semantic(item.semantic_score),
            )
        )

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
