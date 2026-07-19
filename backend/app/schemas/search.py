"""Search schemas — including the transparency contract.

Every result carries a ``RelevanceAnalysis`` so the client can show *why*
it was selected, how confident the system is, and which signals
contributed to its score. Unexplained ranked lists are not part of this
API.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class Modality(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    AUDIO = "audio"
    MIXED = "mixed"


class ResultCategory(str, Enum):
    WEB = "web"
    IMAGES = "images"
    VIDEOS = "videos"
    NEWS = "news"


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RelevanceSignal(BaseModel):
    """One scored contribution to a result's overall relevance."""

    name: str = Field(description="Signal identifier, e.g. 'semantic_similarity'")
    score: float = Field(ge=0.0, le=1.0)
    weight: float = Field(ge=0.0, le=1.0, description="Weight applied in the final score")
    explanation: str


class RelevanceAnalysis(BaseModel):
    relevance_score: float = Field(ge=0.0, le=1.0)
    confidence: ConfidenceLevel
    signals: list[RelevanceSignal]
    explanation: str = Field(description="Human-readable summary of why this result ranks here")
    matched_terms: list[str] = Field(default_factory=list)


class SearchResultItem(BaseModel):
    category: ResultCategory
    rank: int
    title: str | None = None
    url: str | None = None
    snippet: str | None = None
    source: str | None = None
    thumbnail_url: str | None = None
    image_url: str | None = None
    date: str | None = None
    analysis: RelevanceAnalysis


class QueryInterpretation(BaseModel):
    """How the pipeline understood the (possibly multimodal) input."""

    modality: Modality
    original_text: str | None = None
    transcript: str | None = None          # audio input → Whisper transcript
    image_caption: str | None = None       # image input → caption
    interpreted_query: str
    expanded_terms: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class PipelineStage(BaseModel):
    name: str
    status: str  # completed | skipped | degraded
    duration_ms: float
    detail: str | None = None


class SearchMetadata(BaseModel):
    provider: str
    total_results: int
    duration_ms: float
    stages: list[PipelineStage]
    degraded: bool = False


class SearchResponse(BaseModel):
    interpretation: QueryInterpretation
    results: dict[ResultCategory, list[SearchResultItem]]
    overall_confidence: ConfidenceLevel
    summary: str = Field(description="One-paragraph overview of result quality")
    metadata: SearchMetadata
