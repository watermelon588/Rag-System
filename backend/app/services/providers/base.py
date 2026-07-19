"""Search provider interface and normalised result shape."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.schemas.search import ResultCategory


@dataclass
class ProviderResult:
    """A single result normalised across providers and categories."""

    category: ResultCategory
    title: str | None = None
    url: str | None = None
    snippet: str | None = None
    source: str | None = None
    thumbnail_url: str | None = None
    image_url: str | None = None
    date: str | None = None
    provider_rank: int = 0  # 0-based position as returned by the provider
    extra: dict = field(default_factory=dict)

    def text_for_ranking(self) -> str:
        """The text surface used for semantic scoring."""
        parts = [self.title or "", self.snippet or "", self.source or ""]
        return " ".join(part for part in parts if part).strip()


class SearchProvider(ABC):
    """A source of live web results."""

    name: str = "abstract"

    @abstractmethod
    def search(
        self, query: str, categories: list[ResultCategory], limit: int, page: int = 1
    ) -> dict[ResultCategory, list[ProviderResult]]:
        """Fetch one page of results for each requested category
        (``page`` is 1-based).

        Implementations should degrade per-category (an empty list for a
        failed category) and only raise
        :class:`app.core.exceptions.ExternalServiceError` when nothing at
        all could be retrieved.
        """

    @abstractmethod
    def is_configured(self) -> bool:
        """Whether the provider has the credentials/config it needs."""
