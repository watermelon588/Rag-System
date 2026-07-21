"""Serper.dev provider.

Category endpoints are fetched concurrently; a failing category degrades
to an empty list rather than failing the whole search. The original
implementation issued four blocking sequential calls with no timeouts or
error handling.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import requests

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError
from app.core.logging import get_logger
from app.schemas.search import ResultCategory
from app.services.providers.base import ProviderResult, SearchProvider

logger = get_logger(__name__)

_ENDPOINTS = {
    ResultCategory.WEB: ("search", "organic"),
    ResultCategory.IMAGES: ("images", "images"),
    ResultCategory.VIDEOS: ("videos", "videos"),
    ResultCategory.NEWS: ("news", "news"),
}


class SerperProvider(SearchProvider):
    name = "serper"

    def __init__(self) -> None:
        settings = get_settings()
        self._api_key = settings.serper_api_key
        self._base_url = settings.serper_base_url.rstrip("/")
        self._timeout = settings.search_provider_timeout_seconds

    def is_configured(self) -> bool:
        return bool(self._api_key)

    # ----------------------------------------------------------- internals

    def _fetch_category(
        self, query: str, category: ResultCategory, limit: int, page: int
    ) -> list[ProviderResult]:
        endpoint, result_key = _ENDPOINTS[category]
        try:
            response = requests.post(
                f"{self._base_url}/{endpoint}",
                json={"q": query, "num": limit, "page": page},
                headers={"X-API-KEY": self._api_key, "Content-Type": "application/json"},
                timeout=self._timeout,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            logger.warning("Serper %s fetch failed: %s", category.value, exc)
            return []

        items = payload.get(result_key, []) or []
        return [self._normalise(category, rank, item) for rank, item in enumerate(items[:limit])]

    @staticmethod
    def _normalise(category: ResultCategory, rank: int, item: dict) -> ProviderResult:
        return ProviderResult(
            category=category,
            title=item.get("title"),
            url=item.get("link"),
            snippet=item.get("snippet"),
            source=item.get("source") or item.get("channel"),
            thumbnail_url=item.get("imageUrl") if category == ResultCategory.VIDEOS else None,
            image_url=item.get("imageUrl") if category == ResultCategory.IMAGES else None,
            date=item.get("date"),
            provider_rank=rank,
            extra={"position": item.get("position")},
        )

    # ------------------------------------------------------------------ api

    def search(
        self, query: str, categories: list[ResultCategory], limit: int, page: int = 1
    ) -> dict[ResultCategory, list[ProviderResult]]:
        if not self.is_configured():
            raise ExternalServiceError(
                "Web search provider is not configured (missing SERPER_API_KEY)"
            )

        page = max(1, page)
        with ThreadPoolExecutor(max_workers=len(categories)) as pool:
            futures = {
                category: pool.submit(self._fetch_category, query, category, limit, page)
                for category in categories
            }
            results = {category: future.result() for category, future in futures.items()}

        if not any(results.values()):
            raise ExternalServiceError("Web search provider returned no data for any category")
        return results
