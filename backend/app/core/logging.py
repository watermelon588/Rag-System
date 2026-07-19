"""Structured application logging.

Every log line carries the current request ID (propagated through a
context variable set by the request middleware) so a single request can be
traced across layers. Supports human-readable output for development and
JSON output for production log aggregation.
"""

from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_SENSITIVE_KEYS = {"password", "token", "authorization", "secret", "api_key", "apikey"}


def scrub(payload: dict) -> dict:
    """Remove obviously sensitive values before they reach the logs."""
    return {
        key: ("[REDACTED]" if key.lower() in _SENSITIVE_KEYS else value)
        for key, value in payload.items()
    }


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def setup_logging(level: str = "INFO", json_output: bool = False) -> None:
    root = logging.getLogger()
    root.setLevel(level.upper())
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestContextFilter())
    if json_output:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)-8s | %(request_id)s | %(name)s | %(message)s"
            )
        )
    root.addHandler(handler)

    # Quiet noisy third-party loggers without losing warnings.
    for noisy in ("urllib3", "httpx", "sentence_transformers", "faiss", "PIL"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
