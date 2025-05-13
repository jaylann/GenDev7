from __future__ import annotations

import base64
import json
import zlib
from typing import Any


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)  # add missing padding
    return base64.urlsafe_b64decode(data + pad)


def encode(payload: dict[str, Any]) -> str:
    """
    Turn an arbitrary JSON-serialisable object into a short slug string.
    """
    raw = json.dumps(payload, separators=(",", ":")).encode()
    comp = zlib.compress(raw, 9)
    return _b64encode(comp)


def decode(slug: str) -> dict[str, Any]:
    comp = _b64decode(slug)
    raw = zlib.decompress(comp)
    return json.loads(raw)
