"""High-level inference facade.

Services call these functions instead of touching model objects, keeping
framework-specific code (torch tensors, tokenizer templates) in one
place. All functions raise :class:`ModelUnavailableError` when their
capability cannot load; callers with fallback paths use the ``try_*``
variants or check availability first.
"""

from __future__ import annotations

from pathlib import Path

from app.core.logging import get_logger
from app.ml import loaders
from app.ml.registry import registry

logger = get_logger(__name__)


# ----------------------------------------------------------------- embeddings

def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts into unit-normalised vectors."""
    model = registry.get(loaders.TEXT_EMBEDDER)
    vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return [vector.tolist() for vector in vectors]


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]


def embed_image(image_path: str | Path) -> list[float]:
    import torch
    from PIL import Image

    bundle = registry.get(loaders.CLIP)
    image = bundle["preprocess"](Image.open(image_path)).unsqueeze(0).to(bundle["device"])
    with torch.no_grad():
        embedding = bundle["model"].encode_image(image)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
    return embedding[0].cpu().numpy().tolist()


# --------------------------------------------------------------- transcription

def transcribe_audio(audio_path: str | Path) -> str:
    model = registry.get(loaders.WHISPER)
    result = model.transcribe(str(audio_path))
    return str(result.get("text", "")).strip()


# ------------------------------------------------------------------ captioning

def caption_image(image_path: str | Path) -> str:
    import torch
    from PIL import Image

    bundle = registry.get(loaders.CAPTIONER)
    image = Image.open(image_path).convert("RGB")
    inputs = bundle["processor"](images=image, return_tensors="pt").to(bundle["device"])
    with torch.no_grad():
        output = bundle["model"].generate(**inputs, max_new_tokens=40, num_beams=5)
    return bundle["processor"].decode(output[0], skip_special_tokens=True).strip()


# ------------------------------------------------------------------ generation

def generate_text(
    prompt: str,
    *,
    system: str | None = None,
    max_new_tokens: int = 400,
) -> str:
    """Chat-style generation with the local instruction-tuned LLM."""
    import torch

    bundle = registry.get(loaders.LLM)
    tokenizer, model = bundle["tokenizer"], bundle["model"]

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(text, return_tensors="pt").to(model.device)
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = output[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(generated, skip_special_tokens=True).strip()


def try_generate_text(prompt: str, **kwargs) -> str | None:
    """Generation with graceful degradation: returns None when no LLM is
    available so callers can fall back to extractive strategies."""
    from app.core.exceptions import ModelUnavailableError

    try:
        return generate_text(prompt, **kwargs)
    except ModelUnavailableError:
        return None
    except Exception as exc:  # noqa: BLE001 — generation must never break a request
        logger.warning("LLM generation failed, falling back: %s", exc)
        return None


def llm_available() -> bool:
    return registry.is_available(loaders.LLM)
