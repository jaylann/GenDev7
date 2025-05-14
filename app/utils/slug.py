from __future__ import annotations

import base64
import json
import zlib
from typing import Any, Dict, TypeAlias

Payload: TypeAlias = Dict[str, Any]


def _b64encode(data: bytes) -> str:
    """Encode bytes into a URL-safe base64 string without padding."""
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64decode(data: str) -> bytes:
    """Decode a URL-safe base64 string (with optional missing padding) into bytes."""
    pad = "=" * (-len(data) % 4)  # add missing padding
    return base64.urlsafe_b64decode(data + pad)


def encode(payload: Payload) -> str:
    """Serialize and compress a JSON-serializable payload into a URL-safe slug string."""
    raw: bytes = json.dumps(payload, separators=(",", ":")).encode()
    comp: bytes = zlib.compress(raw, level=9)
    return _b64encode(comp)


def decode(slug: str) -> Payload:
    """Decompress and deserialize a slug string back into the original payload."""
    comp: bytes = _b64decode(slug)
    raw: bytes = zlib.decompress(comp)
    return json.loads(raw)
