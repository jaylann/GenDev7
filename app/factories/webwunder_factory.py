from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import List, Optional

from httpx import Response

from app.models import Address
from app.models.base.offer import VoucherKind
from app.models.providers.requests import WebWunderRequest
from app.models.providers.responses import WebWunderResponse
from app.utils import logger


class WebWunderFactory:
    """
    Factory for building WebWunder SOAP requests and parsing responses into WebWunderResponse models.
    """

    @staticmethod
    def build_xml(address: Address) -> str:
        """
        Build SOAP XML payload for a given address.

        Args:
            address (Address): The address to use for building the request.

        Returns:
            str: Serialized XML string for the WebWunder SOAP request.
        """
        req = WebWunderRequest(
            street=address.street,
            house_number=address.house_number,
            city=address.city,
            plz=address.plz,
            country_code=address.country_code,
        )
        xml_str = req.to_xml()
        logger.debug(f"WebWunderFactory.build_xml → {xml_str}")
        return xml_str

    @staticmethod
    def postprocess_response(resp: Response) -> ET.Element:
        """
        Validate HTTP response and parse its XML content.

        Args:
            resp (Response): The HTTP response from the WebWunder service.

        Returns:
            ET.Element: Root XML element of the parsed response.

        Raises:
            httpx.HTTPStatusError: If the response status code indicates an error.
            ET.ParseError: If the response body is invalid XML.
        """
        try:
            resp.raise_for_status()
        except Exception as exc:
            logger.error(f"WebWunderFactory HTTP error: {exc}", exc_info=True)
            raise

        try:
            return ET.fromstring(resp.text)
        except ET.ParseError as exc:
            logger.error(f"WebWunderFactory XML parse error: {exc}", exc_info=True)
            raise

    @staticmethod
    def parse_response(elem: ET.Element) -> Optional[WebWunderResponse]:
        """
        Parse a <products> XML element into a WebWunderResponse.

        Extracts required fields such as provider name and product ID, then
        parses optional details like speed, pricing, contract term, connection
        type, and voucher information.

        Args:
            elem (ET.Element): The XML element representing a product node.

        Returns:
            Optional[WebWunderResponse]: The parsed response model, or None if
                required fields are missing or instantiation fails.
        """

        def get_text_from_node(
            search_root: ET.Element, tag: str, default: str = ""
        ) -> str:
            """
            Retrieve and normalize text content of a child node.

            Args:
                search_root (ET.Element): The XML element to search.
                tag (str): The tag name of the node to find.
                default (str): The value to return if the node or text is missing.

            Returns:
                str: The trimmed text content, or default if not found.
            """
            node = search_root.find(f".//{{*}}{tag}")
            return node.text.strip() if node is not None and node.text else default

        provider_name = get_text_from_node(elem, "providerName")
        product_id = get_text_from_node(elem, "productId")
        if not provider_name or not product_id:
            logger.warning(
                f"WebWunderFactory.parse_response → missing critical field: "
                f"providerName='{provider_name}', productId='{product_id}'."
            )
            return None

        # grab raw strings for Pydantic to coerce and validate
        speed = get_text_from_node(elem, "speed")
        price_intro = get_text_from_node(elem, "monthlyCostInCent")
        price_regular = get_text_from_node(elem, "monthlyCostInCentFrom25thMonth")
        contract_term = get_text_from_node(elem, "contractDurationInMonths")
        connection_type = get_text_from_node(elem, "connectionType", "DSL")

        voucher_type: Optional[VoucherKind] = None
        voucher_value_cents: Optional[str] = None
        voucher_value_percent: Optional[str] = None
        voucher_min_order_value_cents: Optional[str] = None
        voucher_max_value_cents: Optional[str] = None

        voucher_elem = elem.find(".//{*}voucher")
        if voucher_elem is not None:
            xsi_type = voucher_elem.attrib.get(
                "{http://www.w3.org/2001/XMLSchema-instance}type", ""
            ).lower()

            if "absolutevoucher" in xsi_type:
                voucher_type = VoucherKind.ABSOLUTE
                voucher_value_cents = get_text_from_node(voucher_elem, "discountInCent")
                voucher_min_order_value_cents = get_text_from_node(
                    voucher_elem, "minOrderValueInCent"
                )
            elif "percentagevoucher" in xsi_type:
                voucher_type = VoucherKind.PERCENTAGE
                voucher_value_percent = get_text_from_node(voucher_elem, "percentage")
                voucher_max_value_cents = get_text_from_node(
                    voucher_elem, "maxDiscountInCent"
                )
            elif "cashbackvoucher" in xsi_type:
                voucher_type = VoucherKind.CASHBACK
                voucher_value_cents = get_text_from_node(voucher_elem, "cashbackInCent")

        try:
            return WebWunderResponse(
                provider_name=provider_name,
                product_id=product_id,
                speed_down_mbit=speed,
                price_cents_month_intro=price_intro,
                price_cents_month_regular=price_regular,
                contract_duration_months=contract_term,
                connection_type=connection_type,
                voucher_type=voucher_type,
                voucher_value_cents=voucher_value_cents,
                voucher_value_percent=voucher_value_percent,
                voucher_min_order_value_cents=voucher_min_order_value_cents,
                voucher_max_value_cents=voucher_max_value_cents,
            )
        except Exception as exc:
            logger.warning(
                f"WebWunderFactory.parse_response → error instantiating WebWunderResponse "
                f"for productId='{product_id}': {exc}"
            )
            return None

    @staticmethod
    def parse_responses(elems: List[ET.Element]) -> List[WebWunderResponse]:
        """
        Parse multiple <products> XML elements into WebWunderResponse models.

        Args:
            elems (List[ET.Element]): List of XML elements to convert.

        Returns:
            List[WebWunderResponse]: List of successfully parsed response models.
        """
        responses: List[WebWunderResponse] = []
        for el in elems:
            resp = WebWunderFactory.parse_response(el)
            if resp:
                responses.append(resp)
            else:
                logger.warning(
                    "WebWunderFactory.parse_responses → Skipped an element due to parsing issues."
                )
        logger.debug(
            f"WebWunderFactory.parse_responses → Parsed {len(responses)} valid responses "
            f"from {len(elems)} elements."
        )
        return responses
