"""Query understanding: cleanup, optional LLM refinement and expansion."""

from __future__ import annotations

import re

from app.core.config import get_settings
from app.core.logging import get_logger
from app.ml import inference
from app.schemas.search import QueryInterpretation
from app.services.ingestion.modalities import ModalityResult

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
    """Ask the local LLM for a tighter search query. Optional — any failure
    silently falls back to the cleaned query."""
    response = inference.try_generate_text(
        f"Rewrite this as a concise web search query. Reply with the query only, "
        f"no quotes or commentary.\n\nInput: {query}",
        system="You optimise noisy user input into short, precise search queries.",
        max_new_tokens=30,
    )
    if not response:
        return None
    refined = response.strip().strip('"').splitlines()[0].strip()
    # Reject degenerate rewrites (empty, too long, or echoing instructions).
    if not refined or len(refined) > 200 or len(refined.split()) > 20:
        return None
    return refined


def interpret(modality_result: ModalityResult) -> QueryInterpretation:
    settings = get_settings()
    notes: list[str] = []

    if modality_result.transcript:
        notes.append("Audio transcribed with Whisper")
    if modality_result.image_caption:
        notes.append("Image described with a vision captioning model")

    cleaned = clean_query(modality_result.query_text)
    interpreted = cleaned

    if settings.enable_query_expansion:
        refined = _llm_refine(cleaned)
        if refined:
            # The model sometimes re-adds instruction boilerplate; clean again.
            refined = clean_query(refined)
        if refined and refined.lower() != cleaned.lower():
            interpreted = refined
            notes.append("Query refined by the local language model")

    expanded = significant_terms(interpreted)

    return QueryInterpretation(
        modality=modality_result.modality,
        original_text=modality_result.original_text,
        transcript=modality_result.transcript,
        image_caption=modality_result.image_caption,
        interpreted_query=interpreted or modality_result.query_text,
        expanded_terms=expanded,
        notes=notes,
    )
