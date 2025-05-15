from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import List, Optional, Dict, Any

from httpx import Response
from loguru import logger

from app.core.config import get_settings, Settings
from app.models import Address
from app.models.base.offer import VoucherKind, Offer
from app.models.providers.webwunder_request import WebWunderRequest
from app.models.providers.webwunder_response import WebWunderResponse

settings: Settings = get_settings()


class WebWunderFactory:
    """
    Factory for building WebWunder SOAP requests and parsing responses into WebWunderResponse models.
    Parses additional voucher fields (percentage, max discount) and populates into the Offer.
    """

    @staticmethod
    def build_xml(address: Address) -> str:
        req: WebWunderRequest = WebWunderRequest(
            street=address.street,
            house_number=address.house_number,
            city=address.city,
            plz=address.plz,
            country_code=address.country_code,
        )
        xml: str = req.to_xml()
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
            root: ET.Element = ET.fromstring(resp.text)
            return root
        except ET.ParseError as exc:
            logger.error(f"WebWunderFactory XML parse error: {exc}", exc_info=True)
            raise

    @staticmethod
    def parse_response(elem: ET.Element) -> Optional[WebWunderResponse]:
        """
        Parse a single <products> element into a WebWunderResponse, extracting:
          - provider_name, product_id, speed, costs
          - contract term, connection type
          - voucher: absolute, percentage, cashback (value, percent, max)
        """
        xml_str = ET.tostring(elem, encoding="unicode")
        logger.info(f"WebWunderFactory.parse_response: {xml_str}")

        def txt(tag: str, default: str = "") -> str:
            node = elem.find(f".//{{*}}{tag}")
            return node.text.strip() if node is not None and node.text else default

        # required fields
        provider_name: str = txt("providerName")
        product_id: str = txt("productId")
        try:
            speed_down: int = int(txt("speed", "0"))
            price_intro: int = int(txt("monthlyCostInCent", "0"))
            price_regular: int = int(txt("monthlyCostInCentFrom25thMonth", "0"))
            contract_term: int = int(txt("contractDurationInMonths", "0"))
        except ValueError as exc:
            logger.warning(
                f"WebWunderFactory.parse_response → invalid numeric value: {exc}"
            )
            return None

        connection_type: str = txt("connectionType", "DSL")

        # initialize voucher fields
        voucher_type: Optional[VoucherKind] = None
        voucher_value_cents: Optional[int] = None
        voucher_value_percent: Optional[float] = None
        voucher_min_order: Optional[int] = None
        voucher_max_value: Optional[int] = None

        voucher_elem: Optional[ET.Element] = elem.find(".//{*}voucher")
        if voucher_elem is not None:
            xsi_type = voucher_elem.attrib.get(
                "{http://www.w3.org/2001/XMLSchema-instance}type", ""
            ).lower()
            if "absolutevoucher" in xsi_type:
                voucher_type = VoucherKind.ABSOLUTE
                try:
                    voucher_value_cents = int(txt("discountInCent", "0"))
                    voucher_min_order = int(txt("minOrderValueInCent", "0"))
                except ValueError as exc:
                    logger.warning(
                        f"WebWunderFactory.parse_response → invalid voucher numeric: {exc}"
                    )
            elif "percentagevoucher" in xsi_type:
                voucher_type = VoucherKind.PERCENTAGE
                try:
                    voucher_value_percent = float(txt("percentage", "0"))
                    voucher_max_value = int(txt("maxDiscountInCent", "0"))
                except ValueError as exc:
                    logger.warning(
                        f"WebWunderFactory.parse_response → invalid voucher numeric: {exc}"
                    )
            elif "cashbackvoucher" in xsi_type:
                voucher_type = VoucherKind.CASHBACK
                try:
                    voucher_value_cents = int(txt("cashbackInCent", "0"))
                except ValueError as exc:
                    logger.warning(
                        f"WebWunderFactory.parse_response → invalid cashback numeric: {exc}"
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
            voucher_value_cents=voucher_value_cents,
            voucher_value_percent=voucher_value_percent,
            voucher_min_order_value_cents=voucher_min_order,
            voucher_max_value_cents=voucher_max_value,
        )

    @staticmethod
    def parse_responses(elems: List[ET.Element]) -> List[WebWunderResponse]:
        responses: List[WebWunderResponse] = []
        for el in elems:
            resp = WebWunderFactory.parse_response(el)
            if resp:
                responses.append(resp)
            else:
                logger.warning("WebWunderFactory → skipped invalid element")
        logger.debug(f"WebWunderFactory → parsed {len(responses)} total responses")
        return responses
