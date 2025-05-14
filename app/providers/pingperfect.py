# app/providers/pingperfect.py
from __future__ import annotations

from typing import List, Dict, Any

from loguru import logger

from app.core.config import get_settings
from app.models import Address, Offer
from .base import ProviderBase, ProviderError
from ..factories.pingperfect_factory import PingPerfectFactory

settings = get_settings()


class PingPerfectProvider(ProviderBase):
    name = "Ping Perfect"

    async def fetch(self, address: Address) -> List[Offer]:
        """
        Fetch available offers for the given address from PingPerfect.
        """
        logger.info(f"PingPerfectProvider.fetch – address={address}")

        payload_json, headers = PingPerfectFactory.build_payload(address)

        try:
            resp = await self.client.post(
                url=settings.pingperfect_endpoint,
                content=payload_json,
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()
            raw_items: List[Dict[str, Any]] = resp.json()
            logger.info(
                f"PingPerfectProvider → HTTP {resp.status_code}, got {len(raw_items)} items"
            )
        except Exception as exc:
            logger.error(f"PingPerfectProvider → request failed: {exc}", exc_info=True)
            raise ProviderError(f"Ping Perfect failed: {exc}") from exc

        # Get the validated response models…
        responses = PingPerfectFactory.parse_responses(raw_items)
        logger.debug(f"Parsed {len(responses)} PingPerfectResponse models")

        # …and convert them to Offer here
        offers = [r.to_offer(self.name) for r in responses]
        logger.info(f"PingPerfectProvider → returning {len(offers)} offers")
        return offers
