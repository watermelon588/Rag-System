"""Location-aware chunking.

Segments from the parsers are packed into chunks of roughly
``chunk_size`` characters with ``chunk_overlap`` carry-over between
consecutive chunks, while preserving the tightest location metadata the
source offered (page, section, line range, char offsets). Oversized
single segments are split on sentence boundaries.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.config import get_settings
from app.services.rag.parsers import ParsedDocument, Segment

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")


@dataclass
class Chunk:
    ordinal: int
    text: str
    page_number: int | None
    section: str | None
    line_start: int | None
    line_end: int | None
    char_start: int
    char_end: int


def _split_long_text(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    sentences = _SENTENCE_BOUNDARY.split(text)
    pieces: list[str] = []
    current = ""
    for sentence in sentences:
        # A single pathological sentence gets hard-wrapped.
        while len(sentence) > max_chars:
            pieces.append(sentence[:max_chars])
            sentence = sentence[max_chars:]
        if current and len(current) + len(sentence) + 1 > max_chars:
            pieces.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        pieces.append(current)
    return pieces


def _explode_segments(parsed: ParsedDocument, max_chars: int) -> list[Segment]:
    """Ensure no single segment exceeds the chunk size."""
    exploded: list[Segment] = []
    for segment in parsed.segments:
        for piece in _split_long_text(segment.text, max_chars):
            exploded.append(
                Segment(
                    text=piece,
                    page_number=segment.page_number,
                    section=segment.section,
                    line_start=segment.line_start,
                    line_end=segment.line_end,
                )
            )
    return exploded


def build_chunks(parsed: ParsedDocument) -> list[Chunk]:
    settings = get_settings()
    max_chars = settings.chunk_size
    overlap = settings.chunk_overlap

    segments = _explode_segments(parsed, max_chars)
    chunks: list[Chunk] = []
    buffer: list[Segment] = []
    buffer_len = 0
    cursor = 0  # running char offset across the whole document

    def flush() -> None:
        nonlocal buffer, buffer_len, cursor
        if not buffer:
            return
        text = "\n".join(segment.text for segment in buffer).strip()
        if text:
            pages = [seg.page_number for seg in buffer if seg.page_number is not None]
            lines_start = [seg.line_start for seg in buffer if seg.line_start is not None]
            lines_end = [seg.line_end for seg in buffer if seg.line_end is not None]
            sections = [seg.section for seg in buffer if seg.section]
            chunks.append(
                Chunk(
                    ordinal=len(chunks),
                    text=text,
                    page_number=pages[0] if pages else None,
                    section=sections[-1] if sections else None,
                    line_start=min(lines_start) if lines_start else None,
                    line_end=max(lines_end) if lines_end else None,
                    char_start=cursor,
                    char_end=cursor + len(text),
                )
            )
            cursor += len(text) + 1

        # Seed the next chunk with trailing segments as overlap for context
        # continuity across chunk boundaries.
        carried: list[Segment] = []
        carried_len = 0
        for segment in reversed(buffer):
            if carried_len + len(segment.text) > overlap:
                break
            carried.insert(0, segment)
            carried_len += len(segment.text)
        buffer = carried
        buffer_len = carried_len

    for segment in segments:
        if buffer_len + len(segment.text) > max_chars and buffer:
            flush()
        buffer.append(segment)
        buffer_len += len(segment.text)

    # Final flush without seeding overlap.
    if buffer:
        text = "\n".join(segment.text for segment in buffer).strip()
        already_emitted = chunks and text and chunks[-1].text.endswith(text)
        if text and not already_emitted:
            pages = [seg.page_number for seg in buffer if seg.page_number is not None]
            lines_start = [seg.line_start for seg in buffer if seg.line_start is not None]
            lines_end = [seg.line_end for seg in buffer if seg.line_end is not None]
            sections = [seg.section for seg in buffer if seg.section]
            chunks.append(
                Chunk(
                    ordinal=len(chunks),
                    text=text,
                    page_number=pages[0] if pages else None,
                    section=sections[-1] if sections else None,
                    line_start=min(lines_start) if lines_start else None,
                    line_end=max(lines_end) if lines_end else None,
                    char_start=cursor,
                    char_end=cursor + len(text),
                )
            )
    return chunks
