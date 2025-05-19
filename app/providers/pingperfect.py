"""
Provider implementation for PingPerfect, fetching and converting offers
for given addresses using HTTP API.
"""
from __future__ import annotations

from typing import List, Dict, Any

import httpx
from app.core import Settings, RetryConfig
from app.exceptions import ProviderError
from app.factories import PingPerfectFactory
from app.models import Address, Offer
from app.models.providers.responses import PingPerfectResponse
from app.providers.base import ProviderBase
from app.utils import get_settings, logger

settings: Settings = get_settings()


class PingPerfectProvider(ProviderBase):
    """
    Adapter for PingPerfect service, extends ProviderBase to retrieve
    network offers for a specific address.
    """
    name: str = "PingPerfect"

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        retry_config: RetryConfig | None = None,
        wants_fiber: bool = False,
    ) -> None:
        """
        Initialize the PingPerfect provider adapter.

        Args:
            client (httpx.AsyncClient): HTTP client for making API requests.
            retry_config (Optional[RetryConfig]): Custom retry settings;
                defaults to base class configuration if not provided.
            wants_fiber (bool): Whether to request fiber-specific offers.
        """
        super().__init__(client, retry_config=retry_config)
        self.wants_fiber: bool = wants_fiber

    async def fetch(self, address: Address) -> List[Offer]:
        """
        Fetch available offers from PingPerfect API for a given address.

        Args:
            address (Address): Target address for which to fetch offers.

        Returns:
            List[Offer]: A list of Offer models based on API response.

        Raises:
            ProviderError: If the HTTP request fails or response validation fails.
        """
        logger.info(f"PingPerfectProvider.fetch – address={address}")

        payload_json, headers = PingPerfectFactory.build_payload(
            address, self.wants_fiber
        )
        payload_json: str  # JSON payload string
        headers: Dict[str, Any]

        try:
            resp = await self.client.post(
                url=settings.pingperfect_endpoint,
                content=payload_json,
                headers=headers,
                timeout=10,
            )
            resp: httpx.Response
            resp.raise_for_status()
            raw_items: List[Dict[str, Any]] = resp.json()
            logger.info(
                f"PingPerfectProvider → HTTP {resp.status_code}, got {len(raw_items)} items"
            )
        except Exception as exc:
            logger.error(f"PingPerfectProvider → request failed: {exc}", exc_info=True)
            raise ProviderError(f"Ping Perfect failed: {exc}") from exc

        # Get the validated response models…
        responses: List[PingPerfectResponse] = PingPerfectFactory.parse_responses(
            raw_items
        )
        logger.debug(f"Parsed {len(responses)} PingPerfectResponse models")

        # …and convert them to Offer here
        offers: List[Offer] = [r.to_offer(self.name) for r in responses]
        logger.info(f"PingPerfectProvider → returning {len(offers)} offers")
        return offers
