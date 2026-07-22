"""Query understanding: cleanup, optional LLM refinement and expansion."""

from __future__ import annotations

import re

from app.core.config import get_settings
from app.core.logging import get_logger
from app.ml import generation
from app.schemas.search import QueryInterpretation
from app.services.search.multimodal import MultimodalQuery

logger = get_logger(__name__)

_FILLER_PATTERN = re.compile(
    r"\b(uh+|um+|erm+|like|you know|i mean|basically|actually|please|can you|"
    r"could you|i want to|i would like to|search for|find me|show me|look up)\b",
    re.IGNORECASE,
)

_STOPWORDS = frozenset(
    "a an and are as at be by for from has he in is it its of on or that the to was were will with".split()
)


def clean_query(text: str) -> str:
    """Rule-based cleanup: strip fillers, collapse whitespace, cap length."""
    text = _FILLER_PATTERN.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:500]


def significant_terms(text: str) -> list[str]:
    """Content-bearing terms, used for lexical matching and explanations."""
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    seen: dict[str, None] = {}
    for token in tokens:
        if len(token) > 2 and token not in _STOPWORDS:
            seen.setdefault(token, None)
    return list(seen)


def _llm_refine(query: str) -> str | None:
    """Ask the local LLM to *tighten* a noisy query (remove filler, fix
    phrasing). It must never expand or reinterpret the query — a short,
    clean query is returned unchanged. Any failure or suspicious rewrite
    falls back to the cleaned query."""
    response = generation.generate(
        "Clean up this search query by removing filler words and fixing "
        "phrasing. Do NOT add new words, topics, or assumptions. Keep it as "
        "short as the original or shorter. Reply with the query only.\n\n"
        f"Query: {query}",
        system=(
            "You tidy noisy search queries. You only remove noise and fix "
            "phrasing; you never add new concepts or expand the query."
        ),
        max_new_tokens=24,
    )
    if not response:
        return None
    refined = response.strip().strip('"').splitlines()[0].strip()
    if not refined or len(refined) > 200:
        return None

    original_terms = set(significant_terms(query))
    refined_terms = set(significant_terms(refined))
    # Reject expansion: a refinement must not grow the query or introduce
    # significant terms that were not in the original (that is the exact
    # failure mode where "frog" becomes "how to identify and care for a frog").
    if len(refined.split()) > len(query.split()):
        return None
    if refined_terms - original_terms:
        return None
    return refined


def interpret(query: MultimodalQuery) -> QueryInterpretation:
    settings = get_settings()
    notes: list[str] = list(query.notes)

    cleaned = clean_query(query.text_query)
    interpreted = cleaned

    # Only refine longer, potentially-noisy queries. Short keyword queries
    # (e.g. "frog") are already ideal search input, so we skip the slow
    # on-CPU LLM call and search them verbatim.
    is_long_enough = len(significant_terms(cleaned)) >= settings.query_refine_min_words
    if settings.enable_query_expansion and is_long_enough:
        refined = _llm_refine(cleaned)
        if refined:
            # The model sometimes re-adds instruction boilerplate; clean again.
            refined = clean_query(refined)
        if refined and refined.lower() != cleaned.lower():
            interpreted = refined
            notes.append("Query refined by the language model")

    expanded = significant_terms(interpreted)

    return QueryInterpretation(
        modality=query.modality,
        original_text=query.original_text,
        transcript=query.transcripts[0] if query.transcripts else None,
        image_caption=query.captions[0] if query.captions else None,
        transcripts=query.transcripts,
        captions=query.captions,
        interpreted_query=interpreted or query.text_query,
        expanded_terms=expanded,
        notes=notes,
        visual_search=query.has_visual_query,
    )
