"""
Module for retrieving and configuring network speed providers.

This module exposes a factory function to initialize provider instances
based on optional filtering criteria and configuration flags.
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
    Retrieve and initialize provider instances.

    Args:
        provider_names (Optional[List[str]]): Names of providers to include. If None, all are used.
        wants_fiber (bool): Whether to configure providers for fiber service.

    Returns:
        List[ProviderBase]: Initialized list of provider instances.
    """
    all_providers: List[ProviderBase] = [
        WebWunderProvider(shared_client),
        ByteMeProvider(shared_client),
        PingPerfectProvider(shared_client, wants_fiber=wants_fiber),
        ServusSpeedProvider(shared_client),
        VerbynDichProvider(shared_client),
    ]

    # Filter providers by name if a whitelist is provided
    if provider_names:
        providers: List[ProviderBase] = [
            p for p in all_providers if p.name in provider_names
        ]
    else:
        providers: List[ProviderBase] = all_providers

    # Log the names of the loaded providers for debugging
    logger.info(f"Loaded providers: {[p.name for p in providers]}; ")
    return providers
