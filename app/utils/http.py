"""
Provides a shared httpx AsyncClient instance for the application,
configured with connection pooling limits, timeouts, and default headers.
"""
import httpx

# Configure connection pooling and keepalive settings
_limits = httpx.Limits(
    max_connections=20, max_keepalive_connections=10, keepalive_expiry=30.0
)
# Shared httpx AsyncClient configured with application-specific limits, timeouts, and headers
shared_client = httpx.AsyncClient(
    headers={"User-Agent": "CHECK24ChallengeApp/1.0"},
    limits=_limits,
    timeout=httpx.Timeout(65.0),
    http2=False,
)
