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
    name: str = "PingPerfect"

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        retry_config: RetryConfig | None = None,
        wants_fiber: bool = False,
    ) -> None:
        """
        Initialize the PingPerfectProvider with an HTTP client and optional fiber preference.
        """
        super().__init__(client, retry_config=retry_config)
        self.wants_fiber: bool = wants_fiber

    async def fetch(self, address: Address) -> List[Offer]:
        """
        Fetch available offers for the given address from PingPerfect.
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
