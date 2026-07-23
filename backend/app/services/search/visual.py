"""Visual re-ranking: score result thumbnails against the CLIP query vector.

For image/video results we download each candidate's thumbnail, embed it in
the same CLIP space as the query, and measure cosine similarity. This is the
concrete mechanism behind "find things that *look* like this" — the query
image's pixels are compared to each result's pixels, not to its title text.

Downloads run concurrently with a bounded worker pool and short timeouts
(mirroring the provider's own fan-out in ``serper.py``); any thumbnail that
fails to fetch or embed simply gets no visual score and falls back to the
text signals, so a slow or dead image URL never blocks or breaks a search.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin

import requests

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.net import UnsafeUrlError, ensure_public_http_url
from app.ml import inference
from app.services.providers.base import ProviderResult

logger = get_logger(__name__)

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MultimodalSearch/1.0)"}
_MAX_REDIRECTS = 3


def _thumbnail_url(result: ProviderResult) -> str | None:
    return result.image_url or result.thumbnail_url


def visual_scores(
    clip_query: list[float], candidates: list[ProviderResult]
) -> dict[int, float]:
    """Return ``{candidate_index: visual_score in [0, 1]}``.

    Only indices whose thumbnail was fetched and embedded appear. Scores are
    min-max normalized across the scored set because raw CLIP cosine
    similarities cluster in a narrow band (~0.2–0.35), so the absolute values
    are poor rank separators but their *ordering* is meaningful.
    """
    if not clip_query or not candidates:
        return {}

    settings = get_settings()
    if not inference.clip_available():
        return {}

    # Only the top slice is worth the network + compute cost.
    scored_slice = list(enumerate(candidates))[: settings.visual_rerank_max_items]
    targets = [(i, _thumbnail_url(c)) for i, c in scored_slice]
    targets = [(i, url) for i, url in targets if url]
    if not targets:
        return {}

    def _score(index: int, url: str) -> tuple[int, float] | None:
        data = _fetch(url, settings.visual_fetch_timeout_seconds, settings.visual_fetch_max_bytes)
        if data is None:
            return None
        vector = inference.try_embed_image_bytes(data)
        if vector is None:
            return None
        return index, _cosine(clip_query, vector)

    raw: dict[int, float] = {}
    max_workers = min(8, len(targets))
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        for outcome in pool.map(lambda pair: _score(*pair), targets):
            if outcome is not None:
                raw[outcome[0]] = outcome[1]

    return _normalize(raw)


def _fetch(url: str, timeout: int, max_bytes: int) -> bytes | None:
    """Download a thumbnail, refusing any URL that points inside our network.

    Redirects are followed by hand (``allow_redirects=False``) so every hop is
    re-checked: a perfectly public thumbnail URL that 302s to 127.0.0.1 or the
    cloud metadata service is the classic SSRF bypass.
    """
    try:
        current = ensure_public_http_url(url)

        for _ in range(_MAX_REDIRECTS + 1):
            response = requests.get(
                current,
                headers=_HEADERS,
                timeout=timeout,
                stream=True,
                allow_redirects=False,
            )

            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("Location")
                response.close()
                if not location:
                    return None
                # Relative redirects resolve against the URL we just fetched.
                current = ensure_public_http_url(urljoin(current, location))
                continue

            response.raise_for_status()
            content = b""
            for chunk in response.iter_content(64 * 1024):
                content += chunk
                if len(content) > max_bytes:
                    logger.info("Thumbnail exceeds size cap, skipping: %s", url)
                    return None
            return content or None

        logger.debug("Thumbnail exceeded the redirect limit: %s", url)
        return None
    except UnsafeUrlError as exc:
        logger.warning("Refused to fetch thumbnail (%s): %s", url, exc)
        return None
    except requests.RequestException as exc:
        logger.debug("Thumbnail fetch failed (%s): %s", url, exc)
        return None


def _cosine(a: list[float], b: list[float]) -> float:
    # Both vectors are unit-normalized, so the dot product is cosine similarity.
    return sum(x * y for x, y in zip(a, b))


def _normalize(raw: dict[int, float]) -> dict[int, float]:
    if not raw:
        return {}
    values = list(raw.values())
    low, high = min(values), max(values)
    if high - low < 1e-6:
        # All equally similar — give them a neutral-high, equal score.
        return {index: 1.0 for index in raw}
    span = high - low
    return {index: (value - low) / span for index, value in raw.items()}
