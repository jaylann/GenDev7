from __future__ import annotations

import hashlib
import hmac
import json

from typing import Any, Dict

from loguru import logger
from pydantic import BaseModel


def sign(payload_obj: BaseModel, timestamp: str, secret: str) -> str:
    """
    Generate an HMAC-SHA256 signature for a Pydantic payload object.

    The payload is serialized to compact JSON via `model_dump()` + `json.dumps(...)`,
    then prefixed by the timestamp and signed with the shared secret.

    Args:
        payload_obj (BaseModel): The request payload model.
        timestamp (str): Unix timestamp as a non-empty string.
        secret (str): Shared secret key as a non-empty string.

    Returns:
        str: Lowercase hexadecimal HMAC-SHA256 digest.

    Raises:
        TypeError: If `timestamp` or `secret` are not non-empty strings.
        RuntimeError: On unexpected serialization or HMAC errors.
    """
    if not isinstance(timestamp, str) or not timestamp:
        logger.error("sign(): `timestamp` must be a non-empty str, got {}", timestamp)
        raise TypeError("`timestamp` must be a non-empty str")
    if not isinstance(secret, str) or not secret:
        logger.error("sign(): `secret` must be a non-empty str")
        raise TypeError("`secret` must be a non-empty str")

    try:
        # Pydantic→dict, then compact JSON
        data: Dict[str, Any] = payload_obj.model_dump(by_alias=True)
        payload_json: str = json.dumps(data, separators=(",", ":"))
    except Exception:
        logger.exception("sign(): failed to serialize payload")
        raise RuntimeError("Failed to serialize payload for HMAC")

    msg: bytes = f"{timestamp}:{payload_json}".encode("utf-8")
    key: bytes = secret.encode("utf-8")

    try:
        signature: str = hmac.new(key, msg, digestmod=hashlib.sha256).hexdigest()
        logger.debug("sign(): generated signature {}", signature)
        return signature
    except Exception:
        logger.exception("sign(): unexpected error during HMAC computation")
        raise RuntimeError("Failed to compute HMAC signature")
