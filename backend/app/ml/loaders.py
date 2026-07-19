"""Model loader functions and capability registration.

Imports of heavy libraries happen *inside* the loaders so that simply
importing this module costs nothing and a missing optional dependency
only disables its own capability.
"""

from __future__ import annotations

from app.core.config import get_settings
from app.ml.registry import registry

TEXT_EMBEDDER = "text_embedder"
CLIP = "clip"
WHISPER = "whisper"
CAPTIONER = "captioner"
LLM = "llm"


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
    registry.register(TEXT_EMBEDDER, _load_text_embedder)
    registry.register(CLIP, _load_clip)
    registry.register(WHISPER, _load_whisper)
    registry.register(CAPTIONER, _load_captioner)
    registry.register(LLM, _load_llm)
