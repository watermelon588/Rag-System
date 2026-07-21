"""Model loader functions and capability registration.

Imports of heavy libraries happen *inside* the loaders so that simply
importing this module costs nothing and a missing optional dependency
only disables its own capability.
"""

from __future__ import annotations

import os

# Disable HuggingFace / transformers / tqdm progress bars *before* those
# libraries are imported by any loader. Under ``uvicorn --reload`` the server
# runs in a child process whose stderr is a redirected pipe, and tqdm writing
# carriage-return progress bars to it raises ``OSError: [Errno 22] Invalid
# argument`` on Windows — which previously made model loading fail (embedder,
# captioner) and forced BM25-only "degraded" ranking. Servers don't need
# progress bars anyway.
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TRANSFORMERS_NO_ADVISORY_WARNINGS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("TQDM_DISABLE", "1")

from app.core.config import get_settings
from app.core.logging import get_logger
from app.ml.registry import registry

logger = get_logger(__name__)

TEXT_EMBEDDER = "text_embedder"
CLIP = "clip"
WHISPER = "whisper"
CAPTIONER = "captioner"
LLM = "llm"


def _silence_progress_bars() -> None:
    """Belt-and-braces: also disable the bars programmatically, since some
    library versions cache the enabled/disabled state at import time."""
    try:
        from transformers.utils import logging as hf_logging

        hf_logging.disable_progress_bar()
    except Exception:  # noqa: BLE001 — best effort
        pass
    try:
        from huggingface_hub.utils import disable_progress_bars

        disable_progress_bars()
    except Exception:  # noqa: BLE001 — best effort
        pass


def _load_text_embedder():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(get_settings().text_embedding_model)


def _load_clip():
    import clip
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, preprocess = clip.load(get_settings().clip_model, device=device)
    return {"model": model, "preprocess": preprocess, "device": device}


def _load_whisper():
    import whisper

    return whisper.load_model(get_settings().whisper_model)


def _load_captioner():
    import torch
    from transformers import BlipForConditionalGeneration, BlipProcessor

    device = "cuda" if torch.cuda.is_available() else "cpu"
    name = get_settings().caption_model
    processor = BlipProcessor.from_pretrained(name)
    model = BlipForConditionalGeneration.from_pretrained(name).to(device)
    return {"processor": processor, "model": model, "device": device}


def _load_llm():
    settings = get_settings()
    if not settings.enable_local_llm:
        raise RuntimeError("Local LLM disabled by configuration (ENABLE_LOCAL_LLM=false)")

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(settings.llm_model)
    model = AutoModelForCausalLM.from_pretrained(
        settings.llm_model, dtype=torch.float32, device_map="auto"
    )
    return {"tokenizer": tokenizer, "model": model}


def register_all() -> None:
    _silence_progress_bars()
    registry.register(TEXT_EMBEDDER, _load_text_embedder)
    registry.register(CLIP, _load_clip)
    registry.register(WHISPER, _load_whisper)
    registry.register(CAPTIONER, _load_captioner)
    registry.register(LLM, _load_llm)
