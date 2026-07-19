"""Retrieval-Augmented Generation over uploaded documents.

Pipeline: ``parsers`` extract location-aware text segments from any
supported format → ``chunking`` builds overlapping, citable chunks →
``indexer`` embeds and persists them → ``retriever`` finds the most
relevant chunks for a question → ``chat`` produces grounded answers
with precise citations (and optional live web augmentation).
"""
