"""Application entry point.

Uses the app-factory pattern: :func:`create_app` assembles configuration,
logging, middleware, error handling and versioned routers. Run with::

    python -m uvicorn app.main:app --reload
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import get_logger, setup_logging
from app.core.middleware import (
    BodySizeLimitMiddleware,
    CsrfOriginMiddleware,
    RateLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from app.db import mongo
from app.ml.loaders import register_all as register_models

logger = get_logger(__name__)


def _check_production_hardening(settings) -> None:
    """Fail fast on deployment settings that silently break or weaken auth.

    These are all cases that work perfectly in development and then misbehave
    in ways that are hard to diagnose from the outside: a cookie the browser
    refuses to store, a wide-open origin list, or a rate limiter keyed on a
    proxy's IP. Better to refuse to boot than to serve an insecure app.
    """
    if not settings.is_production:
        return

    samesite = settings.cookie_samesite.lower()

    # SameSite=None is meaningless (and rejected by every current browser)
    # without Secure. This is the exact combination a Vercel frontend talking
    # to a separately-hosted API needs, so it is worth a hard failure.
    if samesite == "none" and not settings.cookie_secure:
        raise RuntimeError(
            "COOKIE_SECURE must be true when COOKIE_SAMESITE=none — browsers "
            "discard SameSite=None cookies that are not marked Secure."
        )
    if not settings.cookie_secure:
        raise RuntimeError(
            "COOKIE_SECURE must be true in production so auth cookies are "
            "never sent over plain HTTP."
        )

    insecure_origins = [o for o in settings.cors_origins if o.startswith("http://")]
    if insecure_origins:
        logger.warning(
            "CORS allows plain-HTTP origins in production: %s", ", ".join(insecure_origins)
        )
    if "*" in settings.cors_origins:
        raise RuntimeError(
            "CORS_ORIGINS cannot be '*' with credentialed cookies — list the "
            "exact frontend origin(s)."
        )

    if settings.trusted_proxy_hops == 0:
        logger.warning(
            "TRUSTED_PROXY_HOPS is 0: if this app sits behind a proxy or CDN, "
            "rate limiting and login throttling will key every request to the "
            "proxy's IP and apply one shared budget to all users."
        )

    logger.info(
        "Rate limiting and login throttling are in-process. Run a single "
        "worker, or move them to a shared store, or the effective limits "
        "multiply by the worker count."
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.ensure_directories()

    # Connect to MongoDB. A clear, early failure beats confusing per-request
    # errors — but in development we degrade to a warning so the search-only
    # features still work without a database configured.
    try:
        mongo.ping()
        mongo.init_indexes()
        logger.info("Connected to MongoDB database '%s'", settings.mongodb_db_name)
    except Exception as exc:  # noqa: BLE001
        if settings.is_production:
            raise RuntimeError(f"Cannot reach MongoDB: {exc}") from exc
        logger.warning(
            "MongoDB unavailable (%s) — auth and document features will fail "
            "until MONGODB_URI points at a reachable server.",
            exc,
        )

    register_models()  # registration only — models load lazily on first use
    if settings.is_production and settings.secret_key == "change-me-in-production":
        raise RuntimeError("SECRET_KEY must be set in production")
    _check_production_hardening(settings)
    if not settings.serper_api_key:
        logger.warning("SERPER_API_KEY not set — web search will be unavailable")
    logger.info("%s v%s started (%s)", settings.app_name, __version__, settings.environment)
    yield
    mongo.close()
    logger.info("Shutting down")


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level, settings.log_json)

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
    )

    # Middleware executes in reverse registration order; CORS is added last
    # so it wraps everything (including error responses).
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(CsrfOriginMiddleware)
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "PATCH"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )

    register_exception_handlers(app)
    app.include_router(v1_router, prefix=settings.api_v1_prefix)

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {
            "name": settings.app_name,
            "version": __version__,
            "api": settings.api_v1_prefix,
            "docs": "/docs",
        }

    @app.get("/health", include_in_schema=False)
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
