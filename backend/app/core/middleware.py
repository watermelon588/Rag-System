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
from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings
from app.core.logging import get_logger, request_id_var

logger = get_logger("app.access")


def client_ip(request: Request) -> str:
    """The caller's address, honouring X-Forwarded-For only behind a proxy.

    ``trusted_proxy_hops`` says how many proxies sit in front of the app. We
    count that many entries back from the *right* of X-Forwarded-For, because
    everything to the right was appended by infrastructure we control while
    anything further left may have been forged by the client.
    """
    hops = get_settings().trusted_proxy_hops
    if hops > 0:
        forwarded = request.headers.get("x-forwarded-for", "")
        chain = [part.strip() for part in forwarded.split(",") if part.strip()]
        if chain:
            index = max(0, len(chain) - hops)
            return chain[index]
    return request.client.host if request.client else "anonymous"


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

        client_key = client_ip(request)
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


def _is_loopback_origin(origin: str) -> bool:
    host = urlparse(origin).hostname or ""
    return host in {"localhost", "127.0.0.1", "::1"}


class CsrfOriginMiddleware(BaseHTTPMiddleware):
    """Reject state-changing requests that come from a foreign origin.

    CORS alone does not stop CSRF. A browser will happily *send* a cross-site
    ``POST`` — it only withholds the **response** from the attacker's script.
    For JSON that is academic (the preflight blocks it), but our multipart
    endpoints accept exactly what a plain cross-site ``<form>`` can send, with
    no preflight involved. And once production needs ``SameSite=None`` cookies
    for a separate API domain, the cookie itself stops being a barrier.

    So: any unsafe method carrying an ``Origin`` header must name an origin we
    allow. Browsers always attach ``Origin`` to these requests, so a mismatch
    is a genuine cross-site attempt. A *missing* Origin means a non-browser
    client (curl, a mobile app, server-to-server) which is not a CSRF vector —
    there is no ambient cookie to abuse.
    """

    SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in self.SAFE_METHODS:
            return await call_next(request)

        origin = request.headers.get("origin")
        if origin:
            settings = get_settings()
            allowed = {o.rstrip("/") for o in settings.cors_origins}
            normalized = origin.rstrip("/")
            # Same-origin requests (the app served from the API host itself)
            # are always legitimate.
            same_origin = normalized == str(request.base_url).rstrip("/")
            # In development the Vite dev server may land on any port when
            # 5173 is taken, and it proxies /api through itself — so accept
            # loopback origins locally rather than break `npm run dev`. This
            # relaxation never applies in production.
            local_dev = not settings.is_production and _is_loopback_origin(normalized)
            if normalized not in allowed and not same_origin and not local_dev:
                logger.warning(
                    "Blocked cross-origin %s %s from %s",
                    request.method,
                    request.url.path,
                    origin,
                )
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": {
                            "code": "cross_origin_blocked",
                            "message": "Request origin is not allowed",
                            "request_id": request_id_var.get(),
                        }
                    },
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
