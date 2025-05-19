"""
Provides a factory function to create and configure network speed provider clients.

You can filter providers by name and enable fiber-specific configurations.
"""
from typing import List, Optional

from app.providers import (
    WebWunderProvider,
    ByteMeProvider,
    PingPerfectProvider,
    ServusSpeedProvider,
    VerbynDichProvider,
)
from app.providers.base import ProviderBase
from app.utils import shared_client, logger


async def get_providers(
    provider_names: Optional[List[str]] = None, wants_fiber: bool = False
) -> List[ProviderBase]:
    """
    Initialize and return network speed provider instances.

    Constructs provider objects for available network speed services,
    optionally filtering by name and applying fiber configuration.

    Args:
        provider_names (Optional[List[str]]): If provided, only include providers
            whose names appear in this list. Defaults to None (all providers).
        wants_fiber (bool): Whether to configure providers for fiber service.
            Defaults to False.

    Returns:
        List[ProviderBase]: List of initialized provider instances.
    """
    all_providers: List[ProviderBase] = [
        WebWunderProvider(shared_client),
        ByteMeProvider(shared_client),
        PingPerfectProvider(shared_client, wants_fiber=wants_fiber),
        ServusSpeedProvider(shared_client),
        VerbynDichProvider(shared_client),
    ]

    # Filter by provider names if specified
    if provider_names:
        providers: List[ProviderBase] = [
            p for p in all_providers if p.name in provider_names
        ]
    else:
        providers: List[ProviderBase] = all_providers

    # Log loaded provider names
    logger.info(f"Loaded providers: {[p.name for p in providers]}; ")
    return providers
