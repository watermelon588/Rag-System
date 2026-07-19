"""Machine-learning model management.

All models load lazily through :mod:`app.ml.registry` — the API process
starts instantly and heavy weights are only pulled into memory on first
use. A missing optional dependency degrades the single capability that
needs it instead of crashing the whole platform.
"""
