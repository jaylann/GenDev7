"""
Application settings loaded from environment variables.

Includes endpoints and credentials for external services.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from app.core.credential_manager import CredentialManager


class Settings(BaseSettings):
    """
    Application settings for service endpoints and API credentials.

    Loaded from environment variables and cached for reuse.
    Sensitive credentials are accessed through CredentialManager.
    """

    # Endpoints for external services
    webwunder_wsdl: str = (
        "https://webwunder.gendev7.check24.fun/endpunkte/soap/ws/getInternetOffers.wsdl"
    )

    byteme_endpoint: str = "https://byteme.gendev7.check24.fun/app/api/products/data"

    pingperfect_endpoint: str = (
        "https://pingperfect.gendev7.check24.fun/internet/angebote/data"
    )

    servusspeed_base: str = "https://servus-speed.gendev7.check24.fun"

    verbyndich_base: str = "https://verbyndich.gendev7.check24.fun/check24/data"

    cache_ttl_seconds: int = 24 * 60 * 60  # Cache duration in seconds (24 hours)

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    def __init__(self, **data):
        super().__init__(**data)
        # Load credentials on first Settings instance
        CredentialManager.load_credentials_from_env()

    @property
    def webwunder_api_key(self) -> str:
        """Get WebWunder API key securely"""
        return CredentialManager.get_credential("WEBWUNDER_API_KEY") or ""

    @property
    def byteme_api_key(self) -> str:
        """Get ByteMe API key securely"""
        return CredentialManager.get_credential("BYTEME_API_KEY") or ""

    @property
    def pingperfect_client_id(self) -> str:
        """Get PingPerfect client ID securely"""
        return CredentialManager.get_credential("PINGPERFECT_CLIENT_ID") or ""

    @property
    def pingperfect_secret(self) -> str:
        """Get PingPerfect secret securely"""
        return CredentialManager.get_credential("PINGPERFECT_SECRET") or ""

    @property
    def servusspeed_username(self) -> str:
        """Get ServusSpeed username securely"""
        return CredentialManager.get_credential("SERVUSSPEED_USERNAME") or ""

    @property
    def servusspeed_password(self) -> str:
        """Get ServusSpeed password securely"""
        return CredentialManager.get_credential("SERVUSSPEED_PASSWORD") or ""

    @property
    def verbyndich_api_key(self) -> str:
        """Get VerbynDich API key securely"""
        return CredentialManager.get_credential("VERBYNDICH_API_KEY") or ""


@lru_cache
def get_settings() -> Settings:
    """
    Get and cache the application Settings instance.

    Returns:
        Settings: Configuration loaded from environment variables.
    """
    return Settings()
