import httpx

# Shared HTTP client
_limits = httpx.Limits(
    max_connections=20, max_keepalive_connections=10, keepalive_expiry=30.0
)
shared_client = httpx.AsyncClient(
    headers={"User-Agent": "CHECK24ChallengeApp/1.0"},
    limits=_limits,
    timeout=httpx.Timeout(65.0),
    http2=False,
)