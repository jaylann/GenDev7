# app/providers/webwunder.py
from __future__ import annotations

import time
from typing import List, Dict

from httpx import Response
from loguru import logger

from app.core.config import get_settings
from app.models import Address, Offer
from .base import ProviderBase, ProviderError
from ..factories.webwunder_factory import WebWunderFactory

settings = get_settings()


class WebWunderProvider(ProviderBase):
    """
    Adapter for the WebWunder SOAP interface.
    """

    name = "WebWunder"

    async def fetch(self, address: Address) -> List[Offer]:
        logger.info(
            f"WebWunderProvider.fetch – {address.street} {address.house_number}, {address.plz} {address.city}"
        )

        xml_request = WebWunderFactory.build_xml(address)
        headers: Dict[str, str] = {
            "Content-Type": "text/xml; charset=utf-8",
            "X-Api-Key": settings.webwunder_api_key,
            "SOAPAction": "legacyGetInternetOffers",
        }

        start = time.perf_counter()
        try:
            resp: Response = await self.client.post(
                settings.webwunder_wsdl,
                content=xml_request,
                headers=headers,
                timeout=10,
            )
        except Exception as exc:
            logger.error(f"WebWunderProvider HTTP failure: {exc}", exc_info=True)
            raise ProviderError(f"WebWunder request failed: {exc}") from exc

        duration = time.perf_counter() - start
        logger.info(f"WebWunderProvider HTTP {resp.status_code} in {duration:.2f}s")

        # parse XML and extract <products> nodes
        root = WebWunderFactory.postprocess_response(resp)
        product_elems = list(root.iterfind(".//{*}products"))
        logger.info(f"WebWunderProvider → found {len(product_elems)} <products> nodes")
        if not product_elems:
            raise ProviderError("WebWunder response contained no products")

        # get Pydantic‐validated responses, then map to Offer
        responses = WebWunderFactory.parse_responses(product_elems)
        offers = [r.to_offer(self.name) for r in responses]

        logger.info(f"WebWunderProvider → returning {len(offers)} offers")
        return offers
