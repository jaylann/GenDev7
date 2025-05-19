from __future__ import annotations

import time
from typing import List, Dict, Any

import httpx
from httpx import Response

from app.core import RetryConfig
from app.exceptions import ProviderError
from app.factories import WebWunderFactory
from app.models import Address, Offer
from app.providers.base import ProviderBase
from app.utils import logger, get_settings


class WebWunderProvider(ProviderBase):
    """
    Adapter for the WebWunder SOAP interface.

    Sends SOAP requests and parses responses into Offer models.
    """

    name: str = "WebWunder"

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        retry_config: RetryConfig | None = None,
    ) -> None:
        """
        Initialize WebWunderProvider with HTTP client and optional retry_config.
        """
        super().__init__(client, retry_config=retry_config)
        # load settings per instance
        self.settings = get_settings()

    async def fetch(self, address: Address) -> List[Offer]:
        """
        Fetch broadband offers for a given address via WebWunder SOAP service.

        Args:
            address (Address): Target address for lookup.

        Returns:
            List[Offer]: List of available offers.

        Raises:
            ProviderError: On HTTP or parsing failures.
        """
        logger.info(
            f"WebWunderProvider.fetch – {address.street} {address.house_number}, {address.plz} {address.city}"
        )

        xml_request: str = WebWunderFactory.build_xml(address)
        headers: Dict[str, str] = {
            "Content-Type": "text/xml; charset=utf-8",
            "X-Api-Key": self.settings.webwunder_api_key,
            "SOAPAction": "legacyGetInternetOffers",
        }

        start: float = time.perf_counter()
        try:
            resp: Response = await self.client.post(
                self.settings.webwunder_wsdl,
                content=xml_request,
                headers=headers,
                timeout=10,
            )
        except Exception as exc:
            logger.error(f"WebWunderProvider HTTP failure: {exc}", exc_info=True)
            raise ProviderError(f"WebWunder request failed: {exc}") from exc

        duration: float = time.perf_counter() - start
        logger.info(f"WebWunderProvider HTTP {resp.status_code} in {duration:.2f}s")

        # Parse XML and extract <products> nodes
        root: Any = WebWunderFactory.postprocess_response(resp)
        product_elems: List[Any] = list(root.iterfind(".//{*}products"))
        logger.info(f"WebWunderProvider → found {len(product_elems)} <products> nodes")
        if not product_elems:
            raise ProviderError("WebWunder response contained no products")

        # Convert parsed responses to Offer models
        responses: List[Any] = WebWunderFactory.parse_responses(product_elems)
        offers: List[Offer] = [r.to_offer(self.name) for r in responses]

        logger.info(f"WebWunderProvider → returning {len(offers)} offers")
        return offers
