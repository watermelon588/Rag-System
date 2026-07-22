"""Multimodal query building — the heart of genuine hybrid search.

Every input (typed text, one or more images, audio, video) is resolved into
**two** things:

1. ``text_query`` — a keyword string for the web provider (Serper is keyword
   based, so we still need words to fetch a candidate pool). Captions and
   transcripts feed this, but they no longer *drive relevance*.
2. ``clip_vector`` — a single fused vector in CLIP's shared image/text space,
   built from the CLIP-text embedding of the typed words plus the CLIP-image
   embedding of every uploaded image / sampled video frame. This is what lets
   the ranker score results by genuine visual/semantic similarity instead of
   by how well a lossy caption happened to match a title.

So ``image + "in blue"`` fuses the picture's visual vector with the text
vector; ``audio + image + query`` fuses all three. Any combination works,
and the whole thing degrades to text-only ranking when CLIP is unavailable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from fastapi import UploadFile

from app.core.config import get_settings
from app.core.exceptions import InvalidInputError, UnsupportedMediaError
from app.core.logging import get_logger
from app.ml import inference
from app.schemas.search import Modality
from app.services.ingestion.media import extract_video_frame
from app.services.ingestion.uploads import (
    AUDIO_EXTENSIONS,
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    StoredFile,
    save_upload,
)

logger = get_logger(__name__)


@dataclass
class MultimodalQuery:
    """The resolved, ready-to-search representation of a multimodal request."""

    text_query: str
    modality: Modality
    clip_vector: list[float] | None = None
    original_text: str | None = None
    transcripts: list[str] = field(default_factory=list)
    captions: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    stored_files: list[StoredFile] = field(default_factory=list)

    @property
    def has_visual_query(self) -> bool:
        return self.clip_vector is not None


def classify_upload(file: UploadFile) -> str:
    """Return 'audio' | 'image' | 'video' using content-type first (which
    disambiguates .webm) then falling back to the file extension."""
    content_type = (file.content_type or "").lower()
    extension = Path(file.filename or "").suffix.lower()

    if content_type.startswith("audio/"):
        return "audio"
    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith("video/"):
        return "video"
    if extension in IMAGE_EXTENSIONS:
        return "image"
    if extension in VIDEO_EXTENSIONS:
        return "video"
    if extension in AUDIO_EXTENSIONS:
        return "audio"

    raise UnsupportedMediaError(
        f"Unsupported search input type '{extension or content_type or 'unknown'}'. "
        f"Provide an image, audio clip, or video."
    )


def build(text: str | None, files: list[UploadFile] | None) -> MultimodalQuery:
    """Resolve any combination of text and files into a single search query."""
    settings = get_settings()
    text = (text or "").strip()
    # Drop empty multipart parts (a browser file input with no selection can
    # arrive as an UploadFile with a blank filename).
    files = [f for f in (files or []) if f is not None and (f.filename or "").strip()]

    if not text and not files:
        raise InvalidInputError("Provide text, a file, or both")

    keyword_parts: list[str] = [text] if text else []
    transcripts: list[str] = []
    captions: list[str] = []
    notes: list[str] = []
    stored_files: list[StoredFile] = []
    # (weight, clip_vector) components fused into the query vector below.
    clip_components: list[tuple[float, list[float]]] = []
    kinds: list[str] = []

    # --- typed text contributes a CLIP-text vector (shared space with images).
    if text and settings.enable_visual_search:
        text_clip = inference.try_embed_text_clip(text)
        if text_clip is not None:
            clip_components.append((settings.clip_text_weight, text_clip))

    # --- each uploaded file contributes keywords and (for visuals) a CLIP vector.
    for file in files:
        kind = classify_upload(file)
        kinds.append(kind)
        if kind == "audio":
            _handle_audio(file, keyword_parts, transcripts, notes, stored_files)
        elif kind == "image":
            _handle_image(
                file, keyword_parts, captions, notes, stored_files, clip_components
            )
        else:  # video
            _handle_video(
                file, keyword_parts, transcripts, captions, notes, stored_files,
                clip_components,
            )

    text_query = " ".join(part for part in keyword_parts if part).strip()
    if not text_query:
        raise InvalidInputError(
            "Could not derive any searchable content from the input"
        )

    clip_vector = _fuse(clip_components)
    if clip_vector is not None:
        notes.append("Fused into a CLIP cross-modal query vector")

    return MultimodalQuery(
        text_query=text_query,
        modality=_modality(text, kinds),
        clip_vector=clip_vector,
        original_text=text or None,
        transcripts=transcripts,
        captions=captions,
        notes=notes,
        stored_files=stored_files,
    )


# --------------------------------------------------------------- per-modality

def _handle_audio(file, keyword_parts, transcripts, notes, stored_files) -> None:
    stored = save_upload(file, allowed_extensions=AUDIO_EXTENSIONS)
    stored_files.append(stored)
    transcript = inference.transcribe_audio(stored.path)
    if not transcript:
        raise InvalidInputError("Could not extract any speech from the audio file")
    transcripts.append(transcript)
    keyword_parts.append(transcript)
    notes.append("Audio transcribed with Whisper")


def _handle_image(
    file, keyword_parts, captions, notes, stored_files, clip_components
) -> None:
    settings = get_settings()
    stored = save_upload(file, allowed_extensions=IMAGE_EXTENSIONS)
    stored_files.append(stored)

    # Visual vector — the signal that actually powers cross-modal ranking.
    if settings.enable_visual_search:
        vector = inference.try_embed_image(stored.path)
        if vector is not None:
            clip_components.append((settings.clip_image_weight, vector))

    # Caption — only to seed the keyword pool the provider needs.
    caption = _safe_caption(stored.path)
    if caption:
        captions.append(caption)
        keyword_parts.append(caption)
        notes.append("Image described with a vision model (for keyword retrieval)")
    elif not clip_components:
        raise InvalidInputError("Could not interpret the image content")


def _handle_video(
    file, keyword_parts, transcripts, captions, notes, stored_files, clip_components
) -> None:
    settings = get_settings()
    stored = save_upload(file, allowed_extensions=VIDEO_EXTENSIONS)
    stored_files.append(stored)

    transcript = None
    try:
        transcript = inference.transcribe_audio(stored.path)
    except Exception as exc:  # noqa: BLE001 — no/undecodable audio track
        logger.info("Video transcription unavailable, will use a frame: %s", exc)

    if transcript:
        transcripts.append(transcript)
        keyword_parts.append(transcript)
        notes.append("Video speech transcribed with Whisper")

    # A sampled frame gives the video a visual vector (and a caption fallback).
    frame_path = extract_video_frame(stored.path)
    if frame_path is not None:
        if settings.enable_visual_search:
            vector = inference.try_embed_image(frame_path)
            if vector is not None:
                clip_components.append((settings.clip_image_weight, vector))
        if not transcript:
            caption = _safe_caption(frame_path)
            if caption:
                captions.append(caption)
                keyword_parts.append(caption)
                notes.append("Video frame described with a vision model")

    if not transcript and not captions and not clip_components:
        raise InvalidInputError(
            "Could not extract speech or a frame from the video. "
            "Ensure FFmpeg is installed and the file is a valid video."
        )


# ------------------------------------------------------------------ helpers

def _safe_caption(image_path) -> str | None:
    try:
        caption = inference.caption_image(image_path)
    except Exception as exc:  # noqa: BLE001 — captioning must never break search
        logger.warning("Image captioning failed: %s", exc)
        return None
    return caption or None


def _fuse(components: list[tuple[float, list[float]]]) -> list[float] | None:
    """Weighted mean of unit CLIP vectors, renormalized to a unit vector."""
    if not components:
        return None
    dim = len(components[0][1])
    acc = [0.0] * dim
    total = 0.0
    for weight, vector in components:
        if len(vector) != dim:
            continue
        total += weight
        for i, value in enumerate(vector):
            acc[i] += weight * value
    if total <= 0:
        return None
    acc = [value / total for value in acc]
    norm = sum(value * value for value in acc) ** 0.5
    if norm == 0:
        return None
    return [value / norm for value in acc]


def _modality(text: str, kinds: list[str]) -> Modality:
    if not kinds:
        return Modality.TEXT
    if text or len(kinds) > 1 or len(set(kinds)) > 1:
        return Modality.MIXED
    return {
        "image": Modality.IMAGE,
        "audio": Modality.AUDIO,
        "video": Modality.VIDEO,
    }[kinds[0]]
