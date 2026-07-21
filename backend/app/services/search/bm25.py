"""Okapi BM25 keyword scoring.

Computed over the candidate set returned by the provider: each result's
text is a "document" and the candidate list is the "corpus", so IDF is
derived from how the query terms distribute across *this* result set.
Rare, discriminating terms therefore outweigh common ones — a strict
improvement over flat term-overlap counting.

Implemented in the standard library (no extra dependency) because the
corpus is tiny (tens of documents) and re-ranking must stay fast.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.services.search.understanding import significant_terms

# Okapi BM25 free parameters (the literature's standard defaults).
_K1 = 1.5  # term-frequency saturation
_B = 0.75  # length-normalisation strength


@dataclass
class BM25Hit:
    score: float          # normalised to [0, 1] across the candidate set
    matched_terms: list[str]


class BM25Index:
    def __init__(self, documents: list[str]):
        self._docs_terms = [significant_terms(doc) for doc in documents]
        self._doc_len = [len(terms) for terms in self._docs_terms]
        self._avg_len = (sum(self._doc_len) / len(self._doc_len)) if self._doc_len else 0.0

        # Document frequency: how many documents contain each term.
        self._df: dict[str, int] = {}
        for terms in self._docs_terms:
            for term in set(terms):
                self._df[term] = self._df.get(term, 0) + 1
        self._n = len(documents)

    def _idf(self, term: str) -> float:
        # BM25's probabilistic IDF with the standard +1 to keep it positive.
        df = self._df.get(term, 0)
        return math.log(1 + (self._n - df + 0.5) / (df + 0.5))

    def score_all(self, query: str) -> list[BM25Hit]:
        query_terms = significant_terms(query)
        if not query_terms or self._n == 0:
            return [BM25Hit(score=0.0, matched_terms=[]) for _ in range(self._n)]

        raw_scores: list[float] = []
        matched_per_doc: list[list[str]] = []
        for terms, length in zip(self._docs_terms, self._doc_len):
            counts: dict[str, int] = {}
            for term in terms:
                counts[term] = counts.get(term, 0) + 1

            score = 0.0
            matched: list[str] = []
            for term in query_terms:
                tf = counts.get(term, 0)
                if tf == 0:
                    continue
                matched.append(term)
                denom = tf + _K1 * (1 - _B + _B * (length / self._avg_len if self._avg_len else 1))
                score += self._idf(term) * (tf * (_K1 + 1)) / denom
            raw_scores.append(score)
            matched_per_doc.append(matched)

        # Normalise to [0, 1] so the signal composes with the others; the
        # top result gets 1.0, the rest scale relative to it.
        top = max(raw_scores, default=0.0)
        if top <= 0:
            return [BM25Hit(score=0.0, matched_terms=m) for m in matched_per_doc]
        return [
            BM25Hit(score=round(raw / top, 4), matched_terms=matched)
            for raw, matched in zip(raw_scores, matched_per_doc)
        ]
