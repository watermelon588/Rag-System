"""Vector store interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class VectorHit:
    """A nearest-neighbour match. ``score`` is cosine similarity in [0, 1]
    (vectors are stored unit-normalised)."""

    id: str
    score: float


class VectorStore(ABC):
    @abstractmethod
    def add(self, ids: list[str], vectors: list[list[float]]) -> None:
        """Insert vectors keyed by opaque string IDs. Re-adding an existing
        ID replaces its vector."""

    @abstractmethod
    def search(
        self, vector: list[float], top_k: int, allowed_ids: set[str] | None = None
    ) -> list[VectorHit]:
        """Return up to ``top_k`` nearest neighbours, optionally restricted
        to ``allowed_ids`` (used to scope retrieval to selected documents)."""

    @abstractmethod
    def delete(self, ids: list[str]) -> int:
        """Remove vectors; returns the number actually removed."""

    @abstractmethod
    def count(self) -> int: ...
