"""Failure-based throttling for authentication.

The global rate limiter caps *traffic*; it does not distinguish a user
reloading the page from a script working through a password list. This
counts **failed** logins per (client IP + email) and locks that pair out once
they pile up, so credential stuffing dies quickly while a legitimate user who
mistypes their password a few times is untouched.

Successful logins clear the counter, so a correct password always resets the
budget.

Like :class:`~app.core.middleware.SlidingWindowRateLimiter` this is in-memory
and therefore per-process: with multiple workers an attacker gets one budget
per worker. That is a large improvement over none, and the class is small
enough to be swapped for a Redis-backed store when the deployment grows.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class FailureThrottle:
    def __init__(self, max_failures: int, window_seconds: int):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        # The endpoint runs on a threadpool (sync def), so the dict is shared
        # across threads and needs a lock.
        self._lock = threading.Lock()

    def _prune(self, window: deque[float], now: float) -> None:
        cutoff = now - self.window_seconds
        while window and window[0] < cutoff:
            window.popleft()

    def check(self, key: str) -> tuple[bool, int]:
        """``(allowed, retry_after_seconds)`` without recording anything."""
        now = time.monotonic()
        with self._lock:
            window = self._failures[key]
            self._prune(window, now)
            if len(window) >= self.max_failures:
                retry_after = max(1, int(window[0] + self.window_seconds - now))
                return False, retry_after
            return True, 0

    def record_failure(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            window = self._failures[key]
            self._prune(window, now)
            window.append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
