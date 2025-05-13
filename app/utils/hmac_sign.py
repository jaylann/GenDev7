import hmac
import hashlib


def sign(payload: str, timestamp: str, secret: str) -> str:
    """
    Concatenate timestamp + ':' + payload and sign with the shared secret.
    Returns lowercase hex digest.
    """
    msg = f"{timestamp}:{payload}".encode()
    key = secret.encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()
