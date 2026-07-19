"""FAISS-backed vector store.

Uses inner-product search over unit-normalised vectors (equivalent to
cosine similarity). String IDs are mapped to index rows via a sidecar
manifest persisted next to the index file, so the store survives
restarts. Mutations are serialised with a lock; deletes rebuild the
compact index (cheap at document scale, and an implementation detail
hidden behind the :class:`VectorStore` interface).
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

import numpy as np

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.vector.base import VectorHit, VectorStore

logger = get_logger(__name__)


class FaissVectorStore(VectorStore):
    def __init__(self, name: str, dimension: int, directory: Path | None = None):
        import faiss  # local import: optional heavy dependency

        self._faiss = faiss
        self.dimension = dimension
        directory = directory or get_settings().index_dir
        directory.mkdir(parents=True, exist_ok=True)
        self._index_path = directory / f"{name}.faiss"
        self._manifest_path = directory / f"{name}.manifest.json"
        self._lock = threading.RLock()

        if self._index_path.exists() and self._manifest_path.exists():
            self._index = faiss.read_index(str(self._index_path))
            self._ids: list[str] = json.loads(self._manifest_path.read_text("utf-8"))
            logger.info("Loaded vector index '%s' (%d vectors)", name, len(self._ids))
        else:
            self._index = faiss.IndexFlatIP(dimension)
            self._ids = []

    # ------------------------------------------------------------- helpers

    def _persist(self) -> None:
        self._faiss.write_index(self._index, str(self._index_path))
        self._manifest_path.write_text(json.dumps(self._ids), "utf-8")

    @staticmethod
    def _as_matrix(vectors: list[list[float]]) -> np.ndarray:
        matrix = np.asarray(vectors, dtype="float32")
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return matrix / norms

    # ----------------------------------------------------------------- api

    def add(self, ids: list[str], vectors: list[list[float]]) -> None:
        if not ids:
            return
        if len(ids) != len(vectors):
            raise ValueError("ids and vectors must have equal length")
        with self._lock:
            existing = set(ids) & set(self._ids)
            if existing:
                self._delete_unlocked(list(existing))
            self._index.add(self._as_matrix(vectors))
            self._ids.extend(ids)
            self._persist()

    def search(
        self, vector: list[float], top_k: int, allowed_ids: set[str] | None = None
    ) -> list[VectorHit]:
        with self._lock:
            if not self._ids:
                return []
            # Over-fetch when filtering so the post-filter list can still fill top_k.
            fetch = min(len(self._ids), top_k if allowed_ids is None else max(top_k * 5, 50))
            query = self._as_matrix([vector])
            scores, rows = self._index.search(query, fetch)

            hits: list[VectorHit] = []
            for score, row in zip(scores[0], rows[0]):
                if row < 0 or row >= len(self._ids):
                    continue
                chunk_id = self._ids[row]
                if allowed_ids is not None and chunk_id not in allowed_ids:
                    continue
                # Cosine similarity of unit vectors lies in [-1, 1]; clamp to [0, 1].
                hits.append(VectorHit(id=chunk_id, score=float(max(0.0, min(1.0, score)))))
                if len(hits) >= top_k:
                    break
            return hits

    def delete(self, ids: list[str]) -> int:
        with self._lock:
            removed = self._delete_unlocked(ids)
            if removed:
                self._persist()
            return removed

    def _delete_unlocked(self, ids: list[str]) -> int:
        doomed = set(ids) & set(self._ids)
        if not doomed:
            return 0
        keep_rows = [row for row, chunk_id in enumerate(self._ids) if chunk_id not in doomed]
        if keep_rows:
            vectors = np.vstack([self._index.reconstruct(row) for row in keep_rows])
        else:
            vectors = np.empty((0, self.dimension), dtype="float32")
        self._index = self._faiss.IndexFlatIP(self.dimension)
        if len(vectors):
            self._index.add(vectors)
        self._ids = [self._ids[row] for row in keep_rows]
        return len(doomed)

    def count(self) -> int:
        with self._lock:
            return len(self._ids)


_stores: dict[str, FaissVectorStore] = {}
_stores_lock = threading.Lock()

TEXT_EMBEDDING_DIM = 384  # all-MiniLM-L6-v2


def get_document_store() -> FaissVectorStore:
    """Process-wide store holding document-chunk embeddings."""
    with _stores_lock:
        if "documents" not in _stores:
            _stores["documents"] = FaissVectorStore("documents", TEXT_EMBEDDING_DIM)
        return _stores["documents"]
