"""HTTP middleware: request context, access logging, rate limiting and
security headers.

The rate limiter is an in-memory sliding window suitable for a single
process; the class is deliberately isolated behind the middleware boundary
so it can be swapped for a shared store (e.g. Redis) without touching any
other layer.
"""

from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings
from app.core.logging import get_logger, request_id_var

logger = get_logger("app.access")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns a request ID, times the request and writes an access log."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)

        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-Ms"] = f"{elapsed_ms:.1f}"
        logger.info(
            "%s %s -> %s (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Helmet-equivalent response headers.

    (`helmet` is Express-only; this is the same header set applied natively
    for Starlette/FastAPI.)

    The API returns JSON, so the CSP is locked down to `default-src 'none'`
    — nothing should ever be loaded or executed from an API response. The
    interactive docs are the one exception: Swagger UI pulls its bundle from
    a CDN, so those paths get a policy that permits it.
    """

    # Paths that render HTML and therefore need a usable (looser) policy.
    _DOC_PATHS = ("/docs", "/redoc", "/openapi.json")

    _API_CSP = (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    )
    _DOCS_CSP = (
        "default-src 'self'; "
        "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
        "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
        "img-src 'self' data: https://fastapi.tiangolo.com; "
        "font-src 'self' https://cdn.jsdelivr.net; "
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
    )

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        settings = get_settings()

        is_docs = request.url.path.startswith(self._DOC_PATHS)
        response.headers.setdefault(
            "Content-Security-Policy", self._DOCS_CSP if is_docs else self._API_CSP
        )

        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        # Modern guidance is to disable the legacy auditor rather than enable it.
        response.headers.setdefault("X-XSS-Protection", "0")
        response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
        response.headers.setdefault("Origin-Agent-Cluster", "?1")
        # Microphone stays available to our own origin (the voice search
        # button); camera and geolocation are switched off entirely.
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), geolocation=(), microphone=(self), interest-cohort=()",
        )
        # Don't advertise the server implementation.
        response.headers["Server"] = "neuron"

        # HSTS is only meaningful over TLS, and pinning it in development
        # would poison localhost for every other project on the machine.
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> tuple[bool, int]:
        now = time.monotonic()
        window = self._hits[key]
        cutoff = now - self.window_seconds
        while window and window[0] < cutoff:
            window.popleft()
        if len(window) >= self.max_requests:
            retry_after = max(1, int(window[0] + self.window_seconds - now))
            return False, retry_after
        window.append(now)
        return True, 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    EXEMPT_PATHS = {"/", "/health", "/docs", "/openapi.json", "/redoc"}

    def __init__(self, app):
        super().__init__(app)
        settings = get_settings()
        self.limiter = SlidingWindowRateLimiter(
            settings.rate_limit_requests, settings.rate_limit_window_seconds
        )

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)

        client_key = request.client.host if request.client else "anonymous"
        allowed, retry_after = self.limiter.allow(client_key)
        if not allowed:
            logger.warning("Rate limit exceeded for %s on %s", client_key, request.url.path)
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "rate_limit_exceeded",
                        "message": "Too many requests, please slow down",
                        "request_id": request_id_var.get(),
                    }
                },
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Rejects oversized payloads before they are read into memory."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        max_bytes = get_settings().max_upload_size_mb * 1024 * 1024
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > max_bytes:
            return JSONResponse(
                status_code=413,
                content={
                    "error": {
                        "code": "payload_too_large",
                        "message": f"Request exceeds the {get_settings().max_upload_size_mb} MB limit",
                        "request_id": request_id_var.get(),
                    }
                },
            )
        return await call_next(request)
