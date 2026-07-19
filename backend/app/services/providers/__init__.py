"""Web search providers.

The pipeline talks to :class:`SearchProvider`; concrete providers
(Serper today, others tomorrow) plug in behind it.
"""

from app.services.providers.base import ProviderResult, SearchProvider
from app.services.providers.serper import SerperProvider

__all__ = ["SearchProvider", "ProviderResult", "SerperProvider"]
