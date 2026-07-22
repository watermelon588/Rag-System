"""Input sanitisation for user-supplied text.

Defence in depth. The React client escapes everything it renders, so stored
HTML is not *directly* exploitable today — but data outlives the UI that
wrote it (exports, emails, a future admin panel, a different client), so we
never persist markup or control characters in the first place.

Two levels:

- :func:`clean_text` — strip HTML/script payloads entirely. For values that
  are stored and later displayed (display names, bios, feedback).
- :func:`clean_query` — keep the text searchable but strip control
  characters and angle brackets. Search queries must not be over-mangled or
  results suffer, so this is deliberately lighter.

Both collapse whitespace and enforce a hard length ceiling, which also caps
"heavy payload" abuse at the field level (the request body as a whole is
capped by BodySizeLimitMiddleware).
"""

from __future__ import annotations

import html
import re
import unicodedata
from typing import Annotated

from pydantic import AfterValidator

# Whole elements whose *content* is dangerous, not just their tags.
_DANGEROUS_BLOCKS = re.compile(
    r"<\s*(script|style|iframe|object|embed|svg|math)\b.*?(?:</\s*\1\s*>|$)",
    re.IGNORECASE | re.DOTALL,
)
_ANY_TAG = re.compile(r"<[^>]*>")
# javascript:, vbscript:, data:text/html … in anything URL-shaped.
_DANGEROUS_SCHEME = re.compile(
    r"(?:java|vb)\s*script\s*:|data\s*:\s*text/html", re.IGNORECASE
)
# Inline event handlers that survive tag stripping in malformed markup.
_EVENT_HANDLER = re.compile(r"\bon[a-z]+\s*=", re.IGNORECASE)
_WHITESPACE = re.compile(r"\s+")

MAX_TEXT = 4000


def _strip_control_chars(value: str) -> str:
    """Drop C0/C1 control and format characters (including zero-width and
    bidi-override characters used to disguise payloads), keeping \n and \t."""
    return "".join(
        char
        for char in value
        if char in "\n\t" or unicodedata.category(char) not in {"Cc", "Cf"}
    )


def clean_text(value: str | None, *, max_length: int = MAX_TEXT) -> str | None:
    """Full strip: no markup, no scripts, no control characters."""
    if value is None:
        return None

    text = _strip_control_chars(value)
    # Decode entities first so "&lt;script&gt;" can't smuggle a tag past us,
    # then strip. (Order matters: strip-then-decode would leave live markup.)
    text = html.unescape(text)
    text = _DANGEROUS_BLOCKS.sub(" ", text)
    text = _ANY_TAG.sub(" ", text)
    text = _DANGEROUS_SCHEME.sub(" ", text)
    text = _EVENT_HANDLER.sub(" ", text)
    text = _WHITESPACE.sub(" ", text).strip()
    return text[:max_length]


def clean_query(value: str | None, *, max_length: int = 2000) -> str | None:
    """Lighter pass for search text: keep it searchable, remove executables."""
    if value is None:
        return None

    text = _strip_control_chars(value)
    text = _DANGEROUS_BLOCKS.sub(" ", text)
    text = _DANGEROUS_SCHEME.sub(" ", text)
    text = _EVENT_HANDLER.sub(" ", text)
    # Angle brackets have no value in a query and are the primary tag vector.
    text = text.replace("<", " ").replace(">", " ")
    text = _WHITESPACE.sub(" ", text).strip()
    return text[:max_length]


def clean_url(value: str | None, *, max_length: int = 2000) -> str | None:
    """Allow only http(s) absolute URLs; reject javascript:/data: payloads."""
    if value is None:
        return None
    text = _strip_control_chars(value).strip()
    if not text:
        return None
    if not re.match(r"^https?://", text, re.IGNORECASE):
        raise ValueError("URL must start with http:// or https://")
    if _DANGEROUS_SCHEME.search(text):
        raise ValueError("URL contains a disallowed scheme")
    return text[:max_length]


# ── Reusable annotated types for Pydantic schemas ────────────────────────

def _clean_text_validator(value: str | None) -> str | None:
    return clean_text(value)


def _clean_query_validator(value: str | None) -> str | None:
    return clean_query(value)


def _clean_url_validator(value: str | None) -> str | None:
    return clean_url(value)


SafeText = Annotated[str, AfterValidator(_clean_text_validator)]
SafeTextOptional = Annotated[str | None, AfterValidator(_clean_text_validator)]
SafeQuery = Annotated[str, AfterValidator(_clean_query_validator)]
SafeUrlOptional = Annotated[str | None, AfterValidator(_clean_url_validator)]
