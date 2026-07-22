"""Centralised application configuration.

All tunables live here and are sourced from the environment (or a local
``.env`` file), so behaviour can change between environments without code
changes. Access settings exclusively through :func:`get_settings` so the
parsed instance is created once and shared.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------ app
    app_name: str = "Multimodal AI Retrieval Platform"
    environment: str = "development"  # development | production | test
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # ----------------------------------------------------------------- http
    # NoDecode: parsed from a comma-separated env string by the validator
    # below instead of pydantic-settings' default JSON decoding.
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    rate_limit_requests: int = 120          # requests per window per client
    rate_limit_window_seconds: int = 60
    max_upload_size_mb: int = 25
    request_timeout_seconds: int = 60

    # ----------------------------------------------------------------- auth
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    # Auth cookies: tokens are delivered as httpOnly cookies (see security).
    cookie_secure: bool = False          # set True in production (HTTPS only)
    cookie_samesite: str = "lax"         # lax | strict | none
    cookie_domain: str = ""              # blank = host-only cookie
    access_cookie_name: str = "mmr_access"
    refresh_cookie_name: str = "mmr_refresh"

    # -------------------------------------------------------------- storage
    storage_dir: Path = BACKEND_DIR / "storage"

    # ----------------------------------------------------------- database (MongoDB)
    # Point this at your MongoDB Atlas SRV connection string, e.g.
    #   mongodb+srv://<user>:<pass>@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "multimodal_ai"
    mongodb_timeout_ms: int = 8000

    # ------------------------------------------------------ search providers
    serper_api_key: str = ""
    serper_base_url: str = "https://google.serper.dev"
    search_provider_timeout_seconds: int = 15
    search_default_limit: int = 10

    # ------------------------------------------------------------ ml models
    text_embedding_model: str = "all-MiniLM-L6-v2"
    clip_model: str = "ViT-B/32"
    whisper_model: str = "base"
    caption_model: str = "Salesforce/blip-image-captioning-base"

    # ------------------------------------------------- multimodal / visual search
    # Genuine cross-modal search fuses every input into ONE CLIP-space query
    # vector and ranks image/video results by visual similarity to it (see
    # services/search/multimodal.py and visual.py). These tune that behaviour.
    enable_visual_search: bool = True
    # Relative weights when fusing the query's text and image CLIP vectors.
    clip_text_weight: float = 0.5
    clip_image_weight: float = 0.5
    # Cap how many result thumbnails we download+embed per category (latency).
    visual_rerank_max_items: int = 20
    visual_fetch_timeout_seconds: int = 6
    # Largest thumbnail we will download before giving up (protects memory).
    visual_fetch_max_bytes: int = 8 * 1024 * 1024
    # ---------------------------------------------------------- text generation
    # Generation provider selection (see app.ml.generation): if GROQ_API_KEY is
    # set the platform uses Groq's fast hosted models; otherwise it falls back
    # to a local model, then to extractive (no-LLM) answers.
    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"   # very fast on Groq's LPUs
    groq_timeout_seconds: int = 30
    # Smaller default local model => noticeably faster CPU inference than 1.5B.
    llm_model: str = "Qwen/Qwen2.5-0.5B-Instruct"
    enable_local_llm: bool = True
    llm_max_new_tokens: int = 320               # cap generation length for speed
    enable_query_expansion: bool = True
    # Only invoke the LLM query rewriter when the cleaned query has at least
    # this many significant words. Short keyword queries ("frog") are already
    # good search input, so we skip the (slow, on-CPU) rewrite entirely.
    query_refine_min_words: int = 6

    # ------------------------------------------------------------------ rag
    chunk_size: int = 800               # characters per chunk
    chunk_overlap: int = 150
    rag_top_k: int = 6
    rag_min_score: float = 0.15         # cosine-similarity floor for grounding
    chat_history_window: int = 6        # prior messages fed to generation
    web_augmentation_threshold: float = 0.30  # below this, offer web search

    # -------------------------------------------------------------- logging
    log_level: str = "INFO"
    log_json: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def upload_dir(self) -> Path:
        return self.storage_dir / "uploads"

    @property
    def document_dir(self) -> Path:
        return self.storage_dir / "documents"

    @property
    def index_dir(self) -> Path:
        return self.storage_dir / "indexes"

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    def ensure_directories(self) -> None:
        for path in (self.storage_dir, self.upload_dir, self.document_dir, self.index_dir):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings
