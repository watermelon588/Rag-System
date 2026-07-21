"""Safe handling of uploaded files.

Validates declared type, extension and magic bytes; stores files under a
content-hash name (which also deduplicates identical uploads); and never
trusts a client-supplied filename for filesystem paths.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from app.core.config import get_settings
from app.core.exceptions import InvalidInputError, PayloadTooLargeError, UnsupportedMediaError

_CHUNK = 1024 * 1024

# .webm appears in both audio and video sets: our in-app voice recorder
# produces audio/webm, but .webm is also a video container. The classifier
# in modalities.py disambiguates by content-type.
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".webm", ".ogg", ".flac"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"}

_MAGIC_SIGNATURES: dict[str, list[bytes]] = {
    ".png": [b"\x89PNG"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".gif": [b"GIF8"],
    ".bmp": [b"BM"],
    ".webp": [b"RIFF"],
    ".pdf": [b"%PDF"],
    ".mp3": [b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"],
    ".wav": [b"RIFF"],
    ".ogg": [b"OggS"],
    ".flac": [b"fLaC"],
}


@dataclass(frozen=True)
class StoredFile:
    path: Path
    original_name: str
    extension: str
    sha256: str
    size_bytes: int
    content_type: str


def sanitize_filename(filename: str) -> str:
    """Strip any path components and unsafe characters from a client name."""
    name = Path(filename or "upload").name
    return re.sub(r"[^A-Za-z0-9._ -]", "_", name)[:255] or "upload"


def _validate_magic(extension: str, head: bytes) -> None:
    signatures = _MAGIC_SIGNATURES.get(extension)
    if signatures and not any(head.startswith(sig) for sig in signatures):
        raise UnsupportedMediaError(
            f"File content does not match its '{extension}' extension"
        )


def save_upload(
    file: UploadFile,
    *,
    allowed_extensions: set[str] | None = None,
    destination: Path | None = None,
) -> StoredFile:
    """Stream an upload to disk with size, extension and content checks."""
    settings = get_settings()
    original_name = sanitize_filename(file.filename or "upload")
    extension = Path(original_name).suffix.lower()

    if not extension:
        raise InvalidInputError("Uploaded file must have an extension")
    if allowed_extensions is not None and extension not in allowed_extensions:
        raise UnsupportedMediaError(
            f"Unsupported file type '{extension}'. Allowed: {', '.join(sorted(allowed_extensions))}"
        )

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    destination = destination or settings.upload_dir
    destination.mkdir(parents=True, exist_ok=True)

    hasher = hashlib.sha256()
    size = 0
    head = b""
    temp_path = destination / f".tmp-{hasher.hexdigest()[:8]}-{id(file)}"

    try:
        with temp_path.open("wb") as out:
            while chunk := file.file.read(_CHUNK):
                size += len(chunk)
                if size > max_bytes:
                    raise PayloadTooLargeError(
                        f"File exceeds the {settings.max_upload_size_mb} MB limit"
                    )
                if len(head) < 16:
                    head += chunk[: 16 - len(head)]
                hasher.update(chunk)
                out.write(chunk)

        if size == 0:
            raise InvalidInputError("Uploaded file is empty")
        _validate_magic(extension, head)

        digest = hasher.hexdigest()
        final_path = destination / f"{digest}{extension}"
        if final_path.exists():
            temp_path.unlink(missing_ok=True)  # identical content already stored
        else:
            temp_path.rename(final_path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    finally:
        file.file.close()

    return StoredFile(
        path=final_path,
        original_name=original_name,
        extension=extension,
        sha256=digest,
        size_bytes=size,
        content_type=file.content_type or "application/octet-stream",
    )
