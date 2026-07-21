"""Text generation with provider fallback.

Resolution order (fast → slow → none):

1. **Groq** — hosted LPU inference; used when ``GROQ_API_KEY`` is set.
   Answers come back in well under a second, which is what makes document
   chat feel responsive.
2. **Local LLM** — the on-device model (via :mod:`app.ml.inference`).
   Correct but slow on CPU.
3. **None** — callers fall back to extractive, still-cited answers.

Services call :func:`generate` (or :func:`try_generate`) and never care
which provider actually served the request.
"""

from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.core.logging import get_logger
from app.ml import inference

logger = get_logger(__name__)


@lru_cache
def _groq_client():
    from groq import Groq

    settings = get_settings()
    return Groq(api_key=settings.groq_api_key, timeout=settings.groq_timeout_seconds)


def groq_available() -> bool:
    return bool(get_settings().groq_api_key)


def _groq_generate(prompt: str, system: str | None, max_new_tokens: int) -> str:
    settings = get_settings()
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    completion = _groq_client().chat.completions.create(
        model=settings.groq_model,
        messages=messages,
        max_tokens=max_new_tokens,
        temperature=0.2,
    )
    return (completion.choices[0].message.content or "").strip()


def generate(
    prompt: str,
    *,
    system: str | None = None,
    max_new_tokens: int | None = None,
) -> str | None:
    """Generate text, trying the fastest configured provider first.

    Returns ``None`` when no generator is available or all fail, so callers
    can degrade gracefully. Never raises for provider issues.
    """
    settings = get_settings()
    max_new_tokens = max_new_tokens or settings.llm_max_new_tokens

    if groq_available():
        try:
            text = _groq_generate(prompt, system, max_new_tokens)
            if text:
                return text
        except Exception as exc:  # noqa: BLE001 — fall through to local
            logger.warning("Groq generation failed, falling back: %s", exc)

    if settings.enable_local_llm:
        text = inference.try_generate_text(
            prompt, system=system, max_new_tokens=max_new_tokens
        )
        if text:
            return text

    return None


def try_generate(prompt: str, **kwargs) -> str | None:
    """Alias kept for call-site clarity; :func:`generate` already never raises."""
    return generate(prompt, **kwargs)


def provider_name() -> str:
    settings = get_settings()
    if groq_available():
        return f"groq:{settings.groq_model}"
    if settings.enable_local_llm and inference.llm_available():
        return f"local:{settings.llm_model}"
    return "none"
