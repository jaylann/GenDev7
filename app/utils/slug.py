"""
Utilities for serializing and compressing JSON payloads into compact, URL-safe slugs.

Provides functions to encode Python payloads into base64-encoded, zlib-compressed strings
and to decode them back into Python objects.
"""
from __future__ import annotations

import base64
import json
import zlib
from typing import Any, Dict, TypeAlias

Payload: TypeAlias = Dict[str, Any]


def _b64encode(data: bytes) -> str:
    """
    Encode bytes into a URL-safe base64 string without padding.

    Args:
        data (bytes): Raw byte sequence to encode.

    Returns:
        str: URL-safe base64-encoded string without trailing '=' padding.
    """
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64decode(data: str) -> bytes:
    """
    Decode a URL-safe base64 string into bytes, adding padding if necessary.

    Args:
        data (str): Base64 string lacking trailing '=' padding.

    Returns:
        bytes: Decoded raw byte sequence.
    """
    pad = "=" * (-len(data) % 4)  # add missing padding
    return base64.urlsafe_b64decode(data + pad)


def encode(payload: Payload) -> str:
    """
    Serialize, compress, and encode a JSON-serializable payload into a slug.

    Args:
        payload (Payload): JSON-serializable dictionary to encode.

    Returns:
        str: URL-safe base64 string representing compressed payload.
    """
    raw: bytes = json.dumps(payload, separators=(",", ":")).encode()
    comp: bytes = zlib.compress(raw, level=9)
    return _b64encode(comp)


def decode(slug: str) -> Payload:
    """
    Decode, decompress, and deserialize a slug string back into a payload.

    Args:
        slug (str): URL-safe base64 string of the compressed payload.

    Returns:
        Payload: Original dictionary reconstructed from the slug.
    """
    comp: bytes = _b64decode(slug)
    raw: bytes = zlib.decompress(comp)
    return json.loads(raw)
