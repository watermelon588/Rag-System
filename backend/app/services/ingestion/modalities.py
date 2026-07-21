"""Modality processing: turn any supported input into query text.

- Audio  → Whisper transcript
- Image  → BLIP caption
- Video  → Whisper transcript of its audio track; if the clip has no
           speech, a BLIP caption of a sampled frame instead.

Every intermediate artefact (transcript, caption) is kept so the search
pipeline can report exactly how it interpreted the input.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

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
class ModalityResult:
    modality: Modality
    query_text: str
    original_text: str | None = None
    transcript: str | None = None
    image_caption: str | None = None
    stored_file: StoredFile | None = None


def _classify_upload(file: UploadFile) -> str:
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


def _combine(text: str, extracted: str) -> str:
    return f"{text} {extracted}".strip() if text else extracted


def process_search_input(text: str | None, file: UploadFile | None) -> ModalityResult:
    """Resolve any combination of text and file into a single search query."""
    text = (text or "").strip()
    if not text and file is None:
        raise InvalidInputError("Provide text, a file, or both")

    if file is None:
        return ModalityResult(modality=Modality.TEXT, query_text=text, original_text=text)

    kind = _classify_upload(file)
    if kind == "audio":
        return _process_audio(text, file)
    if kind == "image":
        return _process_image(text, file)
    return _process_video(text, file)


def _process_audio(text: str, file: UploadFile) -> ModalityResult:
    stored = save_upload(file, allowed_extensions=AUDIO_EXTENSIONS)
    transcript = inference.transcribe_audio(stored.path)
    if not transcript:
        raise InvalidInputError("Could not extract any speech from the audio file")
    return ModalityResult(
        modality=Modality.MIXED if text else Modality.AUDIO,
        query_text=_combine(text, transcript),
        original_text=text or None,
        transcript=transcript,
        stored_file=stored,
    )


def _process_image(text: str, file: UploadFile) -> ModalityResult:
    stored = save_upload(file, allowed_extensions=IMAGE_EXTENSIONS)
    caption = inference.caption_image(stored.path)
    if not caption:
        raise InvalidInputError("Could not interpret the image content")
    return ModalityResult(
        modality=Modality.MIXED if text else Modality.IMAGE,
        query_text=_combine(text, caption),
        original_text=text or None,
        image_caption=caption,
        stored_file=stored,
    )


def _process_video(text: str, file: UploadFile) -> ModalityResult:
    """Prefer the spoken content (transcript); fall back to a visual caption
    of a sampled frame when the clip has no usable speech."""
    stored = save_upload(file, allowed_extensions=VIDEO_EXTENSIONS)

    transcript = None
    try:
        # Whisper reads the video's audio track directly via ffmpeg.
        transcript = inference.transcribe_audio(stored.path)
    except Exception as exc:  # noqa: BLE001 — no/undecodable audio track
        logger.info("Video transcription unavailable, will caption a frame: %s", exc)

    if transcript:
        return ModalityResult(
            modality=Modality.MIXED if text else Modality.VIDEO,
            query_text=_combine(text, transcript),
            original_text=text or None,
            transcript=transcript,
            stored_file=stored,
        )

    # No speech → describe a representative frame.
    frame_path = extract_video_frame(stored.path)
    if frame_path is None:
        raise InvalidInputError(
            "Could not extract speech or a frame from the video. "
            "Ensure FFmpeg is installed and the file is a valid video."
        )
    caption = inference.caption_image(frame_path)
    if not caption:
        raise InvalidInputError("Could not interpret the video content")
    return ModalityResult(
        modality=Modality.MIXED if text else Modality.VIDEO,
        query_text=_combine(text, caption),
        original_text=text or None,
        image_caption=caption,
        stored_file=stored,
    )
