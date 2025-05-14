from __future__ import annotations

import os
import time
import xml.etree.ElementTree as ET
from typing import List

from httpx import Response

from ..core.config import get_settings

settings = get_settings()

from app.models import Offer, Address  # ← import your new enum
from app.utils.logger import logger
from .base import ProviderBase, ProviderError
from ..models.providers.webwunder_request import WebWunderRequest
from ..models.providers.webwunder_response import WebWunderProduct



class WebWunderProvider(ProviderBase):
    """
    Adapter for the *WebWunder* SOAP interface.
    """

    name = "WebWunder"

    @staticmethod
    def _build_xml(a: Address) -> str:
        """
        Build the (very small) SOAP request body.
        """
        request = WebWunderRequest(
            street=a.street,
            house_number=a.house_number,
            city=a.city,
            plz=a.plz,
            country_code=a.country_code,
        )
        return request.to_xml()

    @staticmethod
    def _postprocess_response(r: Response) -> ET.Element:
        """
        Validate HTTP status and parse the XML body into an ElementTree root.
        """
        try:
            r.raise_for_status()
        except Exception as exc:
            logger.error("WebWunder HTTP error", exc_info=True)
            raise ProviderError(str(exc)) from exc

        try:
            return ET.fromstring(r.text)
        except ET.ParseError as exc:
            logger.error("WebWunder XML parse error", exc_info=True)
            raise ProviderError("Invalid XML returned by WebWunder") from exc

    async def fetch(self, address: Address) -> List[Offer]:
        logger.info(
            f"Fetching offers for {address.street} {address.house_number}, {address.plz} {address.city}"
        )

        xml_request = self._build_xml(address)
        headers = {
            "Content-Type": "text/xml; charset=utf-8",
            "X-Api-Key": settings.webwunder_api_key,
            "SOAPAction": "legacyGetInternetOffers",
        }

        start = time.perf_counter()
        response = await self.client.post(
            settings.webwunder_wsdl,
            content=xml_request,
            headers=headers,
            timeout=10,
        )
        duration = time.perf_counter() - start
        logger.info(
            f"WebWunderProvider: HTTP {response.status_code} in {duration:.2f}s"
        )

        root = self._postprocess_response(response)
        product_elems = list(root.iterfind(".//{*}products"))
        logger.info(f"WebWunderProvider: found {len(product_elems)} product nodes")

        if not product_elems:
            raise ProviderError("WebWunder response contained no products")

        # Parse products into Pydantic models and convert to Offer
        products = [WebWunderProduct.from_element(e) for e in product_elems]
        offers = [p.to_offer(self.name) for p in products]

        logger.info(f"WebWunderProvider: returning {len(offers)} offers")
        return offers
