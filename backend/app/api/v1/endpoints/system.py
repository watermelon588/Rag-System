"""System endpoints: health and capability status."""

from __future__ import annotations

from fastapi import APIRouter

from app import __version__
from app.core.config import get_settings
from app.ml import generation
from app.ml.registry import registry
from app.services.providers import SerperProvider

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/health", summary="Liveness probe")
def health() -> dict:
    return {"status": "ok", "version": __version__}


@router.get(
    "/capabilities",
    summary="Feature availability",
    description="Reports which ML capabilities and external providers are "
    "configured/loaded, so clients can adapt their UI.",
)
def capabilities() -> dict:
    settings = get_settings()
    return {
        "version": __version__,
        "environment": settings.environment,
        "models": registry.status(),
        "providers": {
            "serper": SerperProvider().is_configured(),
            "generation": generation.provider_name(),
        },
        "features": {
            "local_llm": settings.enable_local_llm,
            "groq": generation.groq_available(),
            "query_expansion": settings.enable_query_expansion,
        },
    }
