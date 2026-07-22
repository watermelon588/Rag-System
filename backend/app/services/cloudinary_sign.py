"""Cloudinary signed-upload support.

We never proxy image bytes: the browser uploads directly to Cloudinary using
a signature minted here. That keeps the API secret server-side, avoids
doubling bandwidth through this service, and needs no extra dependency —
Cloudinary's signing scheme is just a sorted query string plus a SHA-1.

See https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
"""

from __future__ import annotations

import hashlib
import time

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError

UPLOAD_URL = "https://api.cloudinary.com/v1_1/{cloud_name}/image/upload"

# Params Cloudinary excludes from the signature.
_UNSIGNED = {"file", "cloud_name", "resource_type", "api_key"}


def is_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.cloudinary_cloud_name
        and settings.cloudinary_api_key
        and settings.cloudinary_api_secret
    )


def sign_params(params: dict[str, str]) -> str:
    """SHA-1 of the alphabetically-sorted `k=v&…` string plus the API secret."""
    settings = get_settings()
    signable = {k: v for k, v in params.items() if k not in _UNSIGNED and v != ""}
    payload = "&".join(f"{k}={signable[k]}" for k in sorted(signable))
    return hashlib.sha1(
        (payload + settings.cloudinary_api_secret).encode("utf-8")
    ).hexdigest()


def build_upload_signature(owner_id: str) -> dict:
    """Everything the client needs for one direct upload.

    The signature is bound to a timestamp (Cloudinary rejects stale ones) and
    scoped to a per-user folder so avatars can't overwrite each other.
    """
    if not is_configured():
        raise ExternalServiceError(
            "Image uploads are not configured (missing Cloudinary credentials)"
        )

    settings = get_settings()
    timestamp = int(time.time())
    folder = f"{settings.cloudinary_folder}/{owner_id}"

    # Least-privilege upload: only timestamp + folder are signed.
    #
    # We deliberately do NOT send an incoming `transformation` here. That asks
    # Cloudinary to *derive* a new asset at upload time, which needs extra
    # entitlements and is a common source of
    #   "Request forbidden due to missing permissions (actions=[...])".
    # The avatar is squared off with CSS `object-fit` on the client instead,
    # so nothing is lost.
    params = {
        "timestamp": str(timestamp),
        "folder": folder,
    }

    return {
        "cloud_name": settings.cloudinary_cloud_name,
        "api_key": settings.cloudinary_api_key,
        "timestamp": timestamp,
        "folder": folder,
        "signature": sign_params(params),
        "upload_url": UPLOAD_URL.format(cloud_name=settings.cloudinary_cloud_name),
        "max_bytes": settings.cloudinary_max_image_mb * 1024 * 1024,
    }
