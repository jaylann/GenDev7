from __future__ import annotations

import os
import time
import xml.etree.ElementTree as ET
from typing import List, Optional

from httpx import Response

from app.models import Offer, Address  # ← import your new enum
from app.utils.logger import logger
from .base import ProviderBase, ProviderError
from ..models.base.offer import VoucherKind

SOAP_EP = os.getenv("WEBWUNDER_ENDPOINT", "https://webwunder.gendev7.check24.fun/endpunkte/soap/ws", )
WEBWUNDER_API_KEY = os.getenv("WEBWUNDER_API_KEY")

NS = {"gs": "http://webwunder.gendev7.check24.fun/offerservice"}


class WebWunderProvider(ProviderBase):
    """
    Adapter for the *WebWunder* SOAP interface.
    """
    name = "WebWunder"

    # --------------------------------------------------------------------- #
    # Helpers                                                               #
    # --------------------------------------------------------------------- #
    @staticmethod
    def _build_xml(a: Address) -> str:
        """
        Build the (very small) SOAP request body.
        """
        return f"""
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:gs="http://webwunder.gendev7.check24.fun/offerservice">
  <soapenv:Header/>
  <soapenv:Body>
    <gs:legacyGetInternetOffers>
      <gs:input>
        <gs:installation>true</gs:installation>
        <gs:connectionEnum>DSL</gs:connectionEnum>
        <gs:address>
          <gs:street>{a.street}</gs:street>
          <gs:houseNumber>{a.house_number}</gs:houseNumber>
          <gs:city>{a.city}</gs:city>
          <gs:plz>{a.plz}</gs:plz>
          <gs:countryCode>{a.country_code}</gs:countryCode>
        </gs:address>
      </gs:input>
    </gs:legacyGetInternetOffers>
  </soapenv:Body>
</soapenv:Envelope>
""".strip()

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

    # --------------------------------------------------------------------- #
    # Main entry                                                            #
    # --------------------------------------------------------------------- #
    async def fetch(self, address: Address) -> List[Offer]:
        logger.info(f"WebWunderProvider: fetch for {address.street} {address.house_number}, "
                    f"{address.plz} {address.city} ({address.country_code})")

        xml_request = self._build_xml(address)
        headers = {"Content-Type": "text/xml; charset=utf-8", "X-Api-Key": WEBWUNDER_API_KEY,
                   "SOAPAction": "legacyGetInternetOffers", }

        start = time.perf_counter()
        response = await self.client.post(SOAP_EP, content=xml_request, headers=headers, timeout=10, )
        duration = time.perf_counter() - start
        logger.info(f"WebWunderProvider: HTTP {response.status_code} in {duration:.2f}s")

        root = self._postprocess_response(response)
        product_elems = list(root.iterfind(".//{*}products"))
        logger.info(f"WebWunderProvider: found {len(product_elems)} product nodes")

        if not product_elems:
            raise ProviderError("WebWunder response contained no products")

        offers: List[Offer] = []

        def txt(elem: ET.Element, tag: str, default: str = "") -> str:
            found = elem.find(f".//{{*}}{tag}")
            return found.text.strip() if found is not None and found.text else default

        for prod in product_elems:
            speed = int(txt(prod, "speed", "0"))
            price_intro = int(txt(prod, "monthlyCostInCent", "0"))
            price_regular = int(txt(prod, "monthlyCostInCentFrom25thMonth", "0"))
            contract_term = int(txt(prod, "contractDurationInMonths", "0"))

            # Voucher parsing
            voucher_elem = prod.find(".//{*}voucher")
            voucher_type: Optional[VoucherKind] = None
            voucher_value_cents: Optional[int] = None
            voucher_min_order_value_cents: Optional[int] = None

            if voucher_elem is not None:
                raw_type = voucher_elem.attrib.get("{http://www.w3.org/2001/XMLSchema-instance}type")
                if raw_type and raw_type.lower().endswith("absolutevoucher"):
                    voucher_type = VoucherKind.ABSOLUTE
                    voucher_value_cents = int(txt(voucher_elem, "discountInCent", "0"))
                    voucher_min_order_value_cents = int(txt(voucher_elem, "minOrderValueInCent", "0"))

            offers.append(
                Offer(provider=self.name, plan_name=txt(prod, "providerName"), product_id=txt(prod, "productId"),
                      speed_down_mbit=speed, speed_up_mbit=None, data_cap_gb=None,
                      connection_type=txt(prod, "connectionType", "DSL"), price_cents_month_intro=price_intro,
                      price_cents_month_regular=price_regular, contract_duration_months=contract_term,
                      installation_service_included=True, installation_cost_cents=None, tv_included=False,
                      tv_package_name=None, voucher_type=voucher_type, voucher_value_cents=voucher_value_cents,
                      voucher_min_order_value_cents=voucher_min_order_value_cents, voucher_value_percent=None,
                      max_age=None, ))

        logger.info(f"WebWunderProvider: returning {len(offers)} offers")
        return offers
