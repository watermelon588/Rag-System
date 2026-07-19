"""The multimodal search pipeline.

Stages (each independently degradable):

1. ``understanding``  — resolve modalities, clean and optionally rewrite
   the query, generate expansion terms.
2. retrieval           — fetch candidates from the configured provider.
3. ``ranking``         — semantic re-ranking with embeddings blended with
   lexical and provider-position signals.
4. ``transparency``    — per-result relevance analysis, confidence and
   human-readable explanations.

``orchestrator`` wires the stages together and reports per-stage timing.
"""
