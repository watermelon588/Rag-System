"""Outbound-request safety checks (SSRF guard).

Anything we fetch on behalf of a user — result thumbnails, in particular —
is a URL we did not choose. Left unchecked, `requests.get(url)` will happily
retrieve `http://169.254.169.254/latest/meta-data/` (cloud instance
credentials), `http://localhost:8000/api/...` (our own API, bypassing the
network boundary) or anything else inside the deployment's private network.

So every outbound URL passes through :func:`ensure_public_http_url` first:
the scheme must be http(s) and *every* address the hostname resolves to must
be a public unicast address. Redirects are followed manually so each hop is
re-validated — a public URL that 302s to 127.0.0.1 is the standard bypass.

Caveat worth naming: this is a resolve-then-connect check, so a DNS entry
that changes between the two (rebinding) can still slip through. Closing
that needs connection-level pinning; the guard here removes the whole class
of trivially-exploitable cases, which is the practical win.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

_ALLOWED_SCHEMES = {"http", "https"}


class UnsafeUrlError(ValueError):
    """Raised when a URL points somewhere we refuse to fetch from."""


def _address_is_public(raw: str) -> bool:
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return False
    # `is_global` already excludes most of these, but it is permissive about
    # some reserved ranges, so the explicit checks stay as a belt-and-braces
    # guard against a future stdlib change.
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    ):
        return False
    # IPv4-mapped IPv6 (::ffff:127.0.0.1) must be judged on the mapped value.
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        return _address_is_public(str(mapped))
    return ip.is_global


def ensure_public_http_url(url: str) -> str:
    """Return ``url`` unchanged, or raise :class:`UnsafeUrlError`."""
    parsed = urlparse(url)

    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise UnsafeUrlError(f"Disallowed URL scheme: {parsed.scheme or '(none)'}")

    host = parsed.hostname
    if not host:
        raise UnsafeUrlError("URL has no host")

    try:
        # Every A/AAAA record must be public — a hostname that resolves to
        # both a public and a private address is still an attack.
        infos = socket.getaddrinfo(host, parsed.port or 0, proto=socket.IPPROTO_TCP)
    except OSError as exc:
        raise UnsafeUrlError(f"Could not resolve host '{host}'") from exc

    if not infos:
        raise UnsafeUrlError(f"Host '{host}' resolved to no addresses")

    for info in infos:
        address = info[4][0]
        if not _address_is_public(address):
            raise UnsafeUrlError(
                f"Host '{host}' resolves to non-public address {address}"
            )

    return url


def is_public_http_url(url: str) -> bool:
    """Boolean form of :func:`ensure_public_http_url`."""
    try:
        ensure_public_http_url(url)
    except UnsafeUrlError:
        return False
    return True
