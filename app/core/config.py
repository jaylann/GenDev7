"""Application configuration loaded from environment variables."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Settings for external service endpoints and API credentials.
    Loaded from environment and cached for reuse.
    """
    # Provider endpoints and credentials
    webwunder_wsdl: str = (
        "https://webwunder.gendev7.check24.fun/endpunkte/soap/ws/getInternetOffers.wsdl"
    )
    webwunder_api_key: str

    byteme_endpoint: str = "https://byteme.gendev7.check24.fun/app/api/products/data"
    byteme_api_key: str

    pingperfect_endpoint: str = (
        "https://pingperfect.gendev7.check24.fun/internet/angebote/data"
    )
    pingperfect_client_id: str
    pingperfect_secret: str

    servusspeed_base: str = "https://servus-speed.gendev7.check24.fun"
    servusspeed_username: str
    servusspeed_password: str

    verbyndich_base: str = "https://verbyndich.gendev7.check24.fun/check24/data"
    verbyndich_api_key: str

    cache_ttl_seconds: int = 24 * 60 * 60  # 24 hours

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

