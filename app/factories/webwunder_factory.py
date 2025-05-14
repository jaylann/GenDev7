# app/providers/webwunder_factory.py
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import List, Optional

from httpx import Response
from loguru import logger

from app.core.config import get_settings
from app.models import Address
from app.models.base.offer import VoucherKind
from app.models.providers.webwunder_request import WebWunderRequest
from app.models.providers.webwunder_response import WebWunderResponse

settings = get_settings()


class WebWunderFactory:
    """
    Factory for building WebWunder SOAP requests and parsing responses into WebWunderResponse models.
    """

    @staticmethod
    def build_xml(address: Address) -> str:
        req = WebWunderRequest(
            street=address.street,
            house_number=address.house_number,
            city=address.city,
            plz=address.plz,
            country_code=address.country_code,
        )
        xml = req.to_xml()
        logger.debug(f"WebWunderFactory.build_xml → {xml}")
        return xml

    @staticmethod
    def postprocess_response(resp: Response) -> ET.Element:
        try:
            resp.raise_for_status()
        except Exception as exc:
            logger.error(f"WebWunderFactory HTTP error: {exc}", exc_info=True)
            raise

        try:
            root = ET.fromstring(resp.text)
            return root
        except ET.ParseError as exc:
            logger.error(f"WebWunderFactory XML parse error: {exc}", exc_info=True)
            raise

    @staticmethod
    def parse_response(elem: ET.Element) -> Optional[WebWunderResponse]:
        """
        Inline all of the logic formerly in WebWunderResponse.from_element.
        """

        def txt(tag: str, default: str = "") -> str:
            node = elem.find(f".//{{*}}{tag}")
            return node.text.strip() if node is not None and node.text else default

        # required fields
        provider_name = txt("providerName")
        product_id = txt("productId")
        try:
            speed_down = int(txt("speed", "0"))
            price_intro = int(txt("monthlyCostInCent", "0"))
            price_regular = int(txt("monthlyCostInCentFrom25thMonth", "0"))
            contract_term = int(txt("contractDurationInMonths", "0"))
        except ValueError as exc:
            logger.warning(
                f"WebWunderFactory.parse_response → invalid numeric value: {exc}"
            )
            return None

        connection_type = txt("connectionType", "DSL")

        # voucher parsing
        voucher_elem = elem.find(".//{*}voucher")
        voucher_type: Optional[VoucherKind] = None
        voucher_value: Optional[int] = None
        voucher_min_order: Optional[int] = None

        if voucher_elem is not None:
            raw_type = voucher_elem.attrib.get(
                "{http://www.w3.org/2001/XMLSchema-instance}type", ""
            )
            if raw_type.lower().endswith("absolutevoucher"):
                voucher_type = VoucherKind.ABSOLUTE
                try:
                    voucher_value = int(txt("discountInCent", "0"))
                    voucher_min_order = int(txt("minOrderValueInCent", "0"))
                except ValueError as exc:
                    logger.warning(
                        f"WebWunderFactory.parse_response → invalid voucher numeric: {exc}"
                    )

        return WebWunderResponse(
            provider_name=provider_name,
            product_id=product_id,
            speed_down_mbit=speed_down,
            price_cents_month_intro=price_intro,
            price_cents_month_regular=price_regular,
            contract_duration_months=contract_term,
            connection_type=connection_type,
            voucher_type=voucher_type,
            voucher_value_cents=voucher_value,
            voucher_min_order_value_cents=voucher_min_order,
        )

    @staticmethod
    def parse_responses(elems: List[ET.Element]) -> List[WebWunderResponse]:
        responses: List[WebWunderResponse] = []
        for el in elems:
            resp = WebWunderFactory.parse_response(el)
            if resp is not None:
                responses.append(resp)
            else:
                logger.warning(f"WebWunderFactory → skipped invalid element")
        logger.debug(f"WebWunderFactory → parsed {len(responses)} total responses")
        return responses
