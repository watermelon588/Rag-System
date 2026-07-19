"""Business-logic layer.

Sub-packages own one responsibility each:

- ``vector``      — vector storage abstraction (FAISS implementation)
- ``providers``   — external web-search providers behind a common interface
- ``search``      — the multimodal search pipeline (understand → retrieve →
                    rank → explain)
- ``ingestion``   — uploaded-media validation and modality processing
- ``rag``         — document parsing, chunking, indexing, retrieval and
                    grounded chat
- ``auth``        — user accounts and token issuance
"""
