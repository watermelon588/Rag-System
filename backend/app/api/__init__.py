"""HTTP layer.

Versioned under ``app.api.v1`` so future API versions can coexist:
mount ``app.api.v2`` alongside without breaking existing clients.
Endpoints stay thin — validate, delegate to a service, shape the
response.
"""
