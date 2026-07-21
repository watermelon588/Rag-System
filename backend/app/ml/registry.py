"""Lazy, thread-safe registry for ML models.

Each capability is registered with a loader function. Models are loaded
on first use, cached for the process lifetime, and guarded by a lock so
concurrent first requests do not double-load. If a loader fails (missing
optional dependency, no weights, no GPU memory) the capability is marked
unavailable and callers receive :class:`ModelUnavailableError` — other
capabilities keep working.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.core.exceptions import ModelUnavailableError
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class _Entry:
    loader: Callable[[], Any]
    instance: Any = None
    loaded: bool = False
    failed: bool = False
    error: str | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


class ModelRegistry:
    def __init__(self) -> None:
        self._entries: dict[str, _Entry] = {}

    def register(self, name: str, loader: Callable[[], Any]) -> None:
        self._entries[name] = _Entry(loader=loader)

    def get(self, name: str) -> Any:
        entry = self._entries.get(name)
        if entry is None:
            raise ModelUnavailableError(f"Unknown model capability '{name}'")
        if entry.loaded:
            return entry.instance
        if entry.failed:
            raise ModelUnavailableError(
                f"Capability '{name}' is unavailable: {entry.error}"
            )

        with entry.lock:
            if entry.loaded:  # loaded while we waited for the lock
                return entry.instance
            if entry.failed:
                raise ModelUnavailableError(
                    f"Capability '{name}' is unavailable: {entry.error}"
                )
            try:
                logger.info("Loading model capability '%s'...", name)
                entry.instance = entry.loader()
                entry.loaded = True
                logger.info("Capability '%s' ready", name)
                return entry.instance
            except Exception as exc:  # noqa: BLE001 — degrade, never crash
                entry.failed = True
                entry.error = str(exc)
                logger.warning(
                    "Capability '%s' failed to load: %s", name, exc, exc_info=True
                )
                raise ModelUnavailableError(
                    f"Capability '{name}' is unavailable: {exc}"
                ) from exc

    def is_available(self, name: str) -> bool:
        """True if the capability is registered and has not failed. Does not
        force a load."""
        entry = self._entries.get(name)
        return entry is not None and not entry.failed

    def try_get(self, name: str) -> Any | None:
        """Load-or-None variant for callers with a graceful fallback path."""
        try:
            return self.get(name)
        except ModelUnavailableError:
            return None

    def status(self) -> dict[str, str]:
        out = {}
        for name, entry in self._entries.items():
            if entry.loaded:
                out[name] = "loaded"
            elif entry.failed:
                out[name] = f"failed: {entry.error}"
            else:
                out[name] = "not_loaded"
        return out


registry = ModelRegistry()
