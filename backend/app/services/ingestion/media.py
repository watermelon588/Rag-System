"""Lightweight media helpers built on FFmpeg.

Isolated here so the rest of the ingestion layer doesn't depend on FFmpeg
being present — callers treat a ``None`` return as "frame unavailable"
and degrade gracefully.
"""

from __future__ import annotations

from pathlib import Path

from app.core.logging import get_logger

logger = get_logger(__name__)


def extract_video_frame(video_path: str | Path, at_seconds: float = 1.0) -> Path | None:
    """Grab a single frame from a video as a JPEG and return its path.

    Returns ``None`` if FFmpeg is unavailable or extraction fails, so the
    caller can fall back to another strategy rather than erroring out.
    """
    video_path = Path(video_path)
    frame_path = video_path.with_name(f"{video_path.stem}.frame.jpg")
    try:
        import ffmpeg

        (
            ffmpeg.input(str(video_path), ss=at_seconds)
            .output(str(frame_path), vframes=1, loglevel="quiet")
            .overwrite_output()
            .run()
        )
    except Exception as exc:  # noqa: BLE001 — ffmpeg missing or bad input
        logger.warning("Video frame extraction failed: %s", exc)
        return None

    # Some very short clips have no frame at `at_seconds`; retry at t=0.
    if not frame_path.exists() and at_seconds > 0:
        return extract_video_frame(video_path, at_seconds=0)
    return frame_path if frame_path.exists() else None
