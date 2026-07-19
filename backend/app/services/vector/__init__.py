"""Vector storage abstraction.

Code depends on :class:`app.services.vector.base.VectorStore`; the FAISS
implementation is an interchangeable detail, so a managed vector database
can replace it later without touching retrieval logic.
"""

from app.services.vector.base import VectorHit, VectorStore
from app.services.vector.faiss_store import FaissVectorStore, get_document_store

__all__ = ["VectorStore", "VectorHit", "FaissVectorStore", "get_document_store"]
