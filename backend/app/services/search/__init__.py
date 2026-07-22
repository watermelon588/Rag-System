"""The multimodal search pipeline.

Stages (each independently degradable):

1. ``multimodal``      — fuse text + images + audio/video into one keyword
   query and one CLIP cross-modal vector.
2. ``understanding``   — clean and optionally rewrite the query, generate
   expansion terms.
3. retrieval           — fetch candidates from the configured provider.
4. ``ranking``         — hybrid re-ranking: CLIP visual similarity (image/
   video) blended with dense-embedding, lexical (BM25) and position signals.
5. ``transparency``    — per-result relevance analysis, confidence and
   human-readable explanations.

``orchestrator`` wires the stages together and reports per-stage timing.
"""
