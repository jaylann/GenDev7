from typing import List, Optional

import httpx

from app.providers.base import ProviderBase
from app.providers.byteme import ByteMeProvider
from app.providers.pingperfect import PingPerfectProvider
from app.providers.servusspeed import ServusSpeedProvider
from app.providers.verbyndich import VerbynDichProvider
from app.providers.webwunder import WebWunderProvider
from app.utils.logger import logger

_shared_client = httpx.AsyncClient(timeout=httpx.Timeout(10.0))


async def get_providers(
    provider_names: Optional[List[str]] = None, wants_fiber: bool = False
) -> List[ProviderBase]:
    all_providers: List[ProviderBase] = [
        WebWunderProvider(_shared_client),
        ByteMeProvider(_shared_client),
        PingPerfectProvider(_shared_client, wants_fiber=wants_fiber),
        ServusSpeedProvider(_shared_client),
        VerbynDichProvider(_shared_client),
    ]

    # if the caller gave us a whitelist, filter by name; otherwise use all
    if provider_names:
        providers: List[ProviderBase] = [
            p for p in all_providers if p.name in provider_names
        ]
    else:
        providers: List[ProviderBase] = all_providers

    logger.info(f"Loaded providers: {[p.name for p in providers]}; ")
    return providers
