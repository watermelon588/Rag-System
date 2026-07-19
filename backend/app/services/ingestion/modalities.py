"""Modality processing: turn any supported input into query text.

Audio is transcribed with Whisper; images are captioned with BLIP. The
output keeps every intermediate artefact (transcript, caption) so the
search pipeline can report exactly how it interpreted the input.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import UploadFile

from app.core.exceptions import InvalidInputError, UnsupportedMediaError
from app.core.logging import get_logger
from app.ml import inference
from app.schemas.search import Modality
from app.services.ingestion.uploads import (
    AUDIO_EXTENSIONS,
    IMAGE_EXTENSIONS,
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
    from pathlib import Path

    extension = Path(file.filename or "").suffix.lower()
    if extension in AUDIO_EXTENSIONS:
        return "audio"
    if extension in IMAGE_EXTENSIONS:
        return "image"
    raise UnsupportedMediaError(
        f"Unsupported search input type '{extension or 'unknown'}'. "
        f"Provide audio ({', '.join(sorted(AUDIO_EXTENSIONS))}) "
        f"or image ({', '.join(sorted(IMAGE_EXTENSIONS))})."
    )


def process_search_input(text: str | None, file: UploadFile | None) -> ModalityResult:
    """Resolve any combination of text and file into a single search query."""
    text = (text or "").strip()
    if not text and file is None:
        raise InvalidInputError("Provide text, a file, or both")

    if file is None:
        return ModalityResult(modality=Modality.TEXT, query_text=text, original_text=text)

    kind = _classify_upload(file)
    if kind == "audio":
        stored = save_upload(file, allowed_extensions=AUDIO_EXTENSIONS)
        transcript = inference.transcribe_audio(stored.path)
        if not transcript:
            raise InvalidInputError("Could not extract speech from the audio file")
        query = f"{text} {transcript}".strip() if text else transcript
        return ModalityResult(
            modality=Modality.MIXED if text else Modality.AUDIO,
            query_text=query,
            original_text=text or None,
            transcript=transcript,
            stored_file=stored,
        )

    stored = save_upload(file, allowed_extensions=IMAGE_EXTENSIONS)
    caption = inference.caption_image(stored.path)
    if not caption:
        raise InvalidInputError("Could not interpret the image content")
    query = f"{text} {caption}".strip() if text else caption
    return ModalityResult(
        modality=Modality.MIXED if text else Modality.IMAGE,
        query_text=query,
        original_text=text or None,
        image_caption=caption,
        stored_file=stored,
    )
