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
    from PIL import Image

    return _clip_encode_image(Image.open(image_path))


def embed_image_bytes(data: bytes) -> list[float]:
    """CLIP-embed an in-memory image (e.g. a downloaded result thumbnail)."""
    import io

    from PIL import Image

    return _clip_encode_image(Image.open(io.BytesIO(data)))


def embed_text_clip(text: str) -> list[float]:
    """Embed text into CLIP's *shared* image/text space, so the vector is
    directly comparable to :func:`embed_image` results. This is what makes
    genuine cross-modal (image ↔ text) retrieval possible, as opposed to the
    text-only :func:`embed_text` sentence embedding used for lexical re-ranking."""
    import clip
    import torch

    bundle = registry.get(loaders.CLIP)
    # CLIP's context length is 77 tokens; truncate defensively so long
    # transcripts/captions never raise inside tokenize().
    tokens = clip.tokenize([text[:300]], truncate=True).to(bundle["device"])
    with torch.no_grad():
        embedding = bundle["model"].encode_text(tokens)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
    return embedding[0].cpu().numpy().tolist()


def _clip_encode_image(image) -> list[float]:
    import torch

    bundle = registry.get(loaders.CLIP)
    tensor = bundle["preprocess"](image.convert("RGB")).unsqueeze(0).to(bundle["device"])
    with torch.no_grad():
        embedding = bundle["model"].encode_image(tensor)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
    return embedding[0].cpu().numpy().tolist()


# ------------------------------------------------------- graceful CLIP variants

def try_embed_text_clip(text: str) -> list[float] | None:
    return _try_clip(lambda: embed_text_clip(text))


def try_embed_image(image_path: str | Path) -> list[float] | None:
    return _try_clip(lambda: embed_image(image_path))


def try_embed_image_bytes(data: bytes) -> list[float] | None:
    return _try_clip(lambda: embed_image_bytes(data))


def clip_available() -> bool:
    return registry.is_available(loaders.CLIP)


def _try_clip(fn):
    """Run a CLIP embedding, returning None on any failure so multimodal
    callers degrade to text-only ranking instead of erroring."""
    from app.core.exceptions import ModelUnavailableError

    try:
        return fn()
    except ModelUnavailableError:
        return None
    except Exception as exc:  # noqa: BLE001 — embedding must never break a search
        logger.warning("CLIP embedding failed, skipping visual signal: %s", exc)
        return None


# --------------------------------------------------------------- transcription

def transcribe_audio(audio_path: str | Path) -> str:
    model = registry.get(loaders.WHISPER)
    result = model.transcribe(str(audio_path))
    return str(result.get("text", "")).strip()


def audio_stats(audio_path: str | Path) -> tuple[float, float]:
    """Return (duration_seconds, peak_amplitude) for a decoded clip.

    Whisper answers a silent or sub-second take with an empty string, which is
    indistinguishable from "the model didn't understand you". Probing the
    waveform first lets the API say *why* nothing came back.
    """
    import numpy as np
    import whisper

    samples = whisper.load_audio(str(audio_path))  # 16 kHz mono float32
    if samples.size == 0:
        return 0.0, 0.0
    return samples.size / 16000, float(np.abs(samples).max())


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
