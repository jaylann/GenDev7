# tests/factories/test_webwunder_factory.py
import html  # For escaping in Hypothesis strategy
import xml.etree.ElementTree as ET
from typing import List, Optional, Dict, Any
from unittest.mock import MagicMock, patch

import pytest
from httpx import (
    Response,
    HTTPStatusError,
)
from hypothesis import (
    given,
    strategies as st,
    settings as hypothesis_settings,
    HealthCheck,
)
from pydantic import ValidationError

from app.factories.webwunder_factory import WebWunderFactory
from app.models import Address
from app.models.base import VoucherKind
from app.models.providers.requests.webwunder_request import (
    WebWunderRequest as ActualWebWunderRequest,
)
from app.models.providers.responses.webwunder_response import WebWunderResponse

XML_EXAMPLE_ABSOLUTE_FULL: str = """
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
    <SOAP-ENV:Header/>
    <SOAP-ENV:Body>
        <Output xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice">
            <ns2:products>
                <ns2:productId>401</ns2:productId>
                <ns2:providerName>WebWunder Starter 20</ns2:providerName>
                <ns2:productInfo>
                    <ns2:speed>20</ns2:speed>
                    <ns2:monthlyCostInCent>2218</ns2:monthlyCostInCent>
                    <ns2:monthlyCostInCentFrom25thMonth>2418</ns2:monthlyCostInCentFrom25thMonth>
                    <ns2:voucher xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="ns2:absoluteVoucher">
                        <ns2:discountInCent>10763</ns2:discountInCent>
                        <ns2:minOrderValueInCent>763</ns2:minOrderValueInCent>
                    </ns2:voucher>
                    <ns2:contractDurationInMonths>12</ns2:contractDurationInMonths>
                    <ns2:connectionType>DSL</ns2:connectionType>
                </ns2:productInfo>
            </ns2:products>
            <ns2:products>
                <ns2:productId>402</ns2:productId>
                <ns2:providerName>WebWunder Starter 30</ns2:providerName>
                <ns2:productInfo>
                    <ns2:speed>30</ns2:speed>
                    <ns2:monthlyCostInCent>2418</ns2:monthlyCostInCent>
                    <ns2:monthlyCostInCentFrom25thMonth>2218</ns2:monthlyCostInCentFrom25thMonth>
                    <ns2:voucher xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="ns2:absoluteVoucher">
                        <ns2:discountInCent>10763</ns2:discountInCent>
                        <ns2:minOrderValueInCent>763</ns2:minOrderValueInCent>
                    </ns2:voucher>
                    <ns2:contractDurationInMonths>12</ns2:contractDurationInMonths>
                    <ns2:connectionType>DSL</ns2:connectionType>
                </ns2:productInfo>
            </ns2:products>
        </Output>
    </SOAP-ENV:Body>
</SOAP-ENV:Envelope>
"""

XML_EXAMPLE_PERCENTAGE_FULL: str = """
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
<SOAP-ENV:Header/>
<SOAP-ENV:Body>
    <Output xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice">
        <ns2:products>
            <ns2:productId>P01</ns2:productId>
            <ns2:providerName>WebWunder Percent 20</ns2:providerName>
            <ns2:productInfo>
                <ns2:speed>20</ns2:speed>
                <ns2:monthlyCostInCent>2451</ns2:monthlyCostInCent>
                <ns2:monthlyCostInCentFrom25thMonth>2251</ns2:monthlyCostInCentFrom25thMonth>
                <ns2:voucher xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="ns2:percentageVoucher">
                    <ns2:percentage>12</ns2:percentage> {/* Note: Test expects 12.5, XML has 12. I'll use 12.5 in PRODUCT_XML_PERCENTAGE_VOUCHER */}
                    <ns2:maxDiscountInCent>10778</ns2:maxDiscountInCent>
                </ns2:voucher>
                <ns2:contractDurationInMonths>12</ns2:contractDurationInMonths>
                <ns2:connectionType>DSL</ns2:connectionType> {/* Note: Test expects Cable. I'll use Cable in PRODUCT_XML_PERCENTAGE_VOUCHER */}
            </ns2:productInfo>
        </ns2:products>
    </Output>
</SOAP-ENV:Body>
</SOAP-ENV:Envelope>
"""

PRODUCT_XML_ABSOLUTE_VOUCHER: str = """
<ns2:products xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ns2:productId>401</ns2:productId>
    <ns2:providerName>WebWunder Starter 20</ns2:providerName>
    <ns2:productInfo>
        <ns2:speed>20</ns2:speed>
        <ns2:monthlyCostInCent>2218</ns2:monthlyCostInCent>
        <ns2:monthlyCostInCentFrom25thMonth>2418</ns2:monthlyCostInCentFrom25thMonth>
        <ns2:voucher xsi:type="ns2:absoluteVoucher">
            <ns2:discountInCent>10763</ns2:discountInCent>
            <ns2:minOrderValueInCent>763</ns2:minOrderValueInCent>
        </ns2:voucher>
        <ns2:contractDurationInMonths>12</ns2:contractDurationInMonths>
        <ns2:connectionType>DSL</ns2:connectionType>
    </ns2:productInfo>
</ns2:products>
"""

PRODUCT_XML_PERCENTAGE_VOUCHER: str = """
<ns2:products xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ns2:productId>P01</ns2:productId>
    <ns2:providerName>WebWunder Percent 20</ns2:providerName>
    <ns2:productInfo>
        <ns2:speed>20</ns2:speed>
        <ns2:monthlyCostInCent>2451</ns2:monthlyCostInCent>
        <ns2:monthlyCostInCentFrom25thMonth>2251</ns2:monthlyCostInCentFrom25thMonth>
        <ns2:voucher xsi:type="ns2:percentageVoucher">
            <ns2:percentage>12.5</ns2:percentage>
            <ns2:maxDiscountInCent>10778</ns2:maxDiscountInCent>
        </ns2:voucher>
        <ns2:contractDurationInMonths>12</ns2:contractDurationInMonths>
        <ns2:connectionType>Cable</ns2:connectionType>
    </ns2:productInfo>
</ns2:products>
"""

PRODUCT_XML_CASHBACK_VOUCHER: str = """
<ns2:products xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ns2:productId>CB01</ns2:productId>
    <ns2:providerName>WebWunder Cashback 50</ns2:providerName>
    <ns2:productInfo>
        <ns2:speed>50</ns2:speed>
        <ns2:monthlyCostInCent>3000</ns2:monthlyCostInCent>
        <ns2:monthlyCostInCentFrom25thMonth>3200</ns2:monthlyCostInCentFrom25thMonth>
        <ns2:voucher xsi:type="ns2:cashbackVoucher">
            <ns2:cashbackInCent>5000</ns2:cashbackInCent>
        </ns2:voucher>
        <ns2:contractDurationInMonths>24</ns2:contractDurationInMonths>
        <ns2:connectionType>Fiber</ns2:connectionType>
    </ns2:productInfo>
</ns2:products>
"""

PRODUCT_XML_NO_VOUCHER: str = """
<ns2:products xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice">
    <ns2:productId>NV01</ns2:productId>
    <ns2:providerName>WebWunder NoVoucher 10</ns2:providerName>
    <ns2:productInfo>
        <ns2:speed>10</ns2:speed>
        <ns2:monthlyCostInCent>1500</ns2:monthlyCostInCent>
        <ns2:monthlyCostInCentFrom25thMonth>1500</ns2:monthlyCostInCentFrom25thMonth>
        <ns2:contractDurationInMonths>6</ns2:contractDurationInMonths>
        <ns2:connectionType>DSL</ns2:connectionType>
    </ns2:productInfo>
</ns2:products>
"""

PRODUCT_XML_DIFFERENT_NAMESPACE_PREFIX: str = """
<prod:products xmlns:prod="http://webwunder.gendev7.check24.fun/offerservice" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <prod:productId>NP01</prod:productId>
    <prod:providerName>Namespace Test Product</prod:providerName>
    <prod:productInfo>
        <prod:speed>100</prod:speed>
        <prod:monthlyCostInCent>4000</prod:monthlyCostInCent>
        <prod:monthlyCostInCentFrom25thMonth>4000</prod:monthlyCostInCentFrom25thMonth>
        <prod:contractDurationInMonths>24</prod:contractDurationInMonths>
        <prod:connectionType>Fiber</prod:connectionType>
    </prod:productInfo>
</prod:products>
"""

PRODUCT_XML_FIELDS_DIRECTLY_IN_PRODUCT: str = """
<ns2:products xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice">
    <ns2:productId>FLAT01</ns2:productId>
    <ns2:providerName>Flat Structure Product</ns2:providerName>
    <ns2:speed>75</ns2:speed>
    <ns2:monthlyCostInCent>3500</ns2:monthlyCostInCent>
    <ns2:monthlyCostInCentFrom25thMonth>3800</ns2:monthlyCostInCentFrom25thMonth>
    <ns2:contractDurationInMonths>12</ns2:contractDurationInMonths>
    <ns2:connectionType>Cable</ns2:connectionType>
</ns2:products>
"""


class TestWebWunderFactoryBuildXML:
    """Tests for WebWunderFactory.build_xml method."""

    def test_build_xml_valid_address(self) -> None:
        address: Address = Address(
            street="Musterstraße",
            house_number="1A",
            city="Berlin",
            plz="12345",
            country_code="DE",
        )

        # Test the factory's interaction with WebWunderRequest (mocked)
        # Patch target must be where WebWunderRequest is looked up by the factory.
        with patch(
            "app.factories.webwunder_factory.WebWunderRequest"
        ) as MockWebWunderRequest:
            mock_req_instance = MockWebWunderRequest.return_value
            mock_req_instance.to_xml.return_value = "<mocked_xml>data</mocked_xml>"

            generated_xml: str = WebWunderFactory.build_xml(address)

            MockWebWunderRequest.assert_called_once_with(
                street=address.street,
                house_number=address.house_number,
                city=address.city,
                plz=address.plz,
                country_code=address.country_code,
            )
            mock_req_instance.to_xml.assert_called_once()
            assert generated_xml == "<mocked_xml>data</mocked_xml>"

        # Test against the actual (or a test-local simplified) WebWunderRequest.to_xml() output.
        # This part runs *without* the patch active.
        real_req_instance = ActualWebWunderRequest(
            street=address.street,
            house_number=address.house_number,
            city=address.city,
            plz=address.plz,
            country_code=address.country_code,
        )
        expected_xml_output_from_real_req = real_req_instance.to_xml()

        actual_xml_from_factory: str = WebWunderFactory.build_xml(address)
        assert actual_xml_from_factory == expected_xml_output_from_real_req


class TestWebWunderFactoryPostProcessResponse:
    """Tests for WebWunderFactory.postprocess_response method."""

    def test_postprocess_successful_response(self) -> None:
        mock_resp: MagicMock = MagicMock(spec=Response)
        mock_resp.text = XML_EXAMPLE_ABSOLUTE_FULL
        mock_resp.status_code = 200
        mock_resp.raise_for_status.return_value = None

        root: ET.Element = WebWunderFactory.postprocess_response(mock_resp)
        mock_resp.raise_for_status.assert_called_once()
        assert root is not None
        assert root.tag == "{http://schemas.xmlsoap.org/soap/envelope/}Envelope"

    def test_postprocess_http_error(self) -> None:
        mock_resp: MagicMock = MagicMock(spec=Response)
        mock_resp.status_code = 500
        mock_resp.raise_for_status.side_effect = HTTPStatusError(
            message="Server Error", request=MagicMock(), response=mock_resp
        )
        with pytest.raises(HTTPStatusError):
            WebWunderFactory.postprocess_response(mock_resp)
        mock_resp.raise_for_status.assert_called_once()

    def test_postprocess_xml_parse_error(self) -> None:
        mock_resp: MagicMock = MagicMock(spec=Response)
        mock_resp.text = "<root><unterminatedTag></root>"
        mock_resp.status_code = 200
        mock_resp.raise_for_status.return_value = None
        with pytest.raises(ET.ParseError):
            WebWunderFactory.postprocess_response(mock_resp)
        mock_resp.raise_for_status.assert_called_once()

    def test_postprocess_empty_response_text(self) -> None:
        mock_resp: MagicMock = MagicMock(spec=Response)
        mock_resp.text = ""
        mock_resp.status_code = 200
        mock_resp.raise_for_status.return_value = None
        with pytest.raises(ET.ParseError):
            WebWunderFactory.postprocess_response(mock_resp)
        mock_resp.raise_for_status.assert_called_once()


class TestWebWunderFactoryParseResponse:
    """Tests for WebWunderFactory.parse_response method."""

    @pytest.mark.parametrize(
        "xml_str, expected",
        [
            (
                PRODUCT_XML_ABSOLUTE_VOUCHER,
                WebWunderResponse(
                    provider_name="WebWunder Starter 20",
                    product_id="401",
                    speed_down_mbit=20,
                    price_cents_month_intro=2218,
                    price_cents_month_regular=2418,
                    contract_duration_months=12,
                    connection_type="DSL",
                    voucher_type=VoucherKind.ABSOLUTE,
                    voucher_value_cents=10763,
                    voucher_min_order_value_cents=763,
                    voucher_value_percent=None,
                    voucher_max_value_cents=None,
                ),
            ),
            (
                PRODUCT_XML_PERCENTAGE_VOUCHER,
                WebWunderResponse(
                    provider_name="WebWunder Percent 20",
                    product_id="P01",
                    speed_down_mbit=20,
                    price_cents_month_intro=2451,
                    price_cents_month_regular=2251,
                    contract_duration_months=12,
                    connection_type="Cable",
                    voucher_type=VoucherKind.PERCENTAGE,
                    voucher_value_percent=12.5,  # XML has 12.5
                    voucher_max_value_cents=10778,
                    voucher_value_cents=None,
                    voucher_min_order_value_cents=None,
                ),
            ),
            (
                PRODUCT_XML_CASHBACK_VOUCHER,
                WebWunderResponse(
                    provider_name="WebWunder Cashback 50",
                    product_id="CB01",
                    speed_down_mbit=50,
                    price_cents_month_intro=3000,
                    price_cents_month_regular=3200,
                    contract_duration_months=24,
                    connection_type="Fiber",
                    voucher_type=VoucherKind.CASHBACK,
                    voucher_value_cents=5000,
                    voucher_value_percent=None,
                    voucher_min_order_value_cents=None,
                    voucher_max_value_cents=None,
                ),
            ),
            (
                PRODUCT_XML_NO_VOUCHER,
                WebWunderResponse(
                    provider_name="WebWunder NoVoucher 10",
                    product_id="NV01",
                    speed_down_mbit=10,
                    price_cents_month_intro=1500,
                    price_cents_month_regular=1500,
                    contract_duration_months=6,
                    connection_type="DSL",
                    voucher_type=None,
                    voucher_value_cents=None,
                    voucher_value_percent=None,
                    voucher_min_order_value_cents=None,
                    voucher_max_value_cents=None,
                ),
            ),
        ],
    )
    def test_parse_response_valid_cases(
        self, xml_str: str, expected: WebWunderResponse
    ) -> None:
        element: ET.Element = ET.fromstring(xml_str)
        result: Optional[WebWunderResponse] = WebWunderFactory.parse_response(element)
        assert result == expected

    @pytest.mark.parametrize(
        "field_to_alter, modification_type, new_text_value, is_critical_failure, expected_voucher_val_if_non_critical",
        [
            ("productId", "empty_tag", None, True, None),
            ("productId", "remove_tag", None, True, None),
            ("providerName", "empty_tag", None, True, None),
            ("providerName", "remove_tag", None, True, None),
            ("speed", "change_text", "abc", True, None),
            ("monthlyCostInCent", "change_text", "xyz", True, None),
            ("monthlyCostInCentFrom25thMonth", "change_text", "---", False, None),
            ("contractDurationInMonths", "change_text", "twelve", True, None),
            ("discountInCent", "change_text", "bad", False, None),
            (
                "minOrderValueInCent",
                "change_text",
                "bad",
                False,
                None,
            ),  # For absolute voucher min order
            ("percentage", "change_text", "bad", False, None),
            (
                "maxDiscountInCent",
                "change_text",
                "bad",
                False,
                None,
            ),  # For percentage voucher max discount
            ("cashbackInCent", "change_text", "bad", False, None),
        ],
    )
    def test_parse_response_missing_or_malformed_fields(
        self,
        field_to_alter: str,
        modification_type: str,
        new_text_value: Optional[str],
        is_critical_failure: bool,
        expected_voucher_val_if_non_critical: Optional[Any],
    ) -> None:
        """Test parsing with missing or malformed fields using robust ET modification."""
        base_xml_str: str = PRODUCT_XML_ABSOLUTE_VOUCHER
        # Select correct base XML for voucher field alterations
        if field_to_alter in ["percentage", "maxDiscountInCent"]:
            base_xml_str = PRODUCT_XML_PERCENTAGE_VOUCHER
        elif field_to_alter == "cashbackInCent":
            base_xml_str = PRODUCT_XML_CASHBACK_VOUCHER

        elem_to_parse: ET.Element = ET.fromstring(base_xml_str)

        # Find the node to modify. This searches globally within the <products> element.
        # For voucher fields, this works because they are unique enough.
        target_node: Optional[ET.Element] = elem_to_parse.find(
            f".//{{*}}{field_to_alter}"
        )

        if target_node is None and modification_type != "remove_tag":
            pytest.skip(
                f"Node '{field_to_alter}' not found for modification type '{modification_type}' in XML: {base_xml_str}"
            )
            return

        if modification_type == "remove_tag":
            if target_node is not None:
                # Find parent to remove child. This is a generic way.
                parent_map: Dict[ET.Element, ET.Element] = {
                    c: p for p in elem_to_parse.iter() for c in p
                }
                parent = parent_map.get(target_node)
                if parent is not None:
                    parent.remove(target_node)
                elif (
                    target_node == elem_to_parse
                ):  # Should not happen for fields inside
                    pytest.skip(
                        f"Cannot remove the root element '{field_to_alter}' this way."
                    )
                    return
            # If target_node is None, it's already "removed", so parsing proceeds.
        elif modification_type == "empty_tag":
            if target_node is not None:
                target_node.text = None  # Clears text content
                for child in list(target_node):  # Remove any sub-elements
                    target_node.remove(child)
        elif modification_type == "change_text":
            if target_node is not None:
                target_node.text = (
                    new_text_value  # Sets text to potentially invalid value
                )

        result: Optional[WebWunderResponse] = WebWunderFactory.parse_response(
            elem_to_parse
        )

        if is_critical_failure:
            assert result is None, (
                f"Expected None for critical field error: '{field_to_alter}' with {modification_type}='{new_text_value}'. "
                f"Got: {result}. Parsed XML: {ET.tostring(elem_to_parse, encoding='unicode')}"
            )
        else:
            assert result is not None, (
                f"Expected a valid response despite non-critical field error: '{field_to_alter}'. "
                f"Parsed XML: {ET.tostring(elem_to_parse, encoding='unicode')}"
            )
            # Check specific voucher field values
            if field_to_alter == "discountInCent":
                assert (
                    result.voucher_value_cents == expected_voucher_val_if_non_critical
                )
            elif field_to_alter == "minOrderValueInCent":
                assert (
                    result.voucher_min_order_value_cents
                    == expected_voucher_val_if_non_critical
                )
            elif field_to_alter == "percentage":
                assert (
                    result.voucher_value_percent == expected_voucher_val_if_non_critical
                )
            elif field_to_alter == "maxDiscountInCent":
                assert (
                    result.voucher_max_value_cents
                    == expected_voucher_val_if_non_critical
                )
            elif field_to_alter == "cashbackInCent":
                assert (
                    result.voucher_value_cents == expected_voucher_val_if_non_critical
                )

    def test_parse_response_missing_connection_type_defaults_to_dsl(self) -> None:
        xml_str: str = """
        <ns2:products xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice">
            <ns2:productId>DEF01</ns2:productId>
            <ns2:providerName>Default ConnType</ns2:providerName>
            <ns2:productInfo>
                <ns2:speed>25</ns2:speed>
                <ns2:monthlyCostInCent>2000</ns2:monthlyCostInCent>
                <ns2:monthlyCostInCentFrom25thMonth>2000</ns2:monthlyCostInCentFrom25thMonth>
                <ns2:contractDurationInMonths>12</ns2:contractDurationInMonths>
            </ns2:productInfo>
        </ns2:products>
        """
        element: ET.Element = ET.fromstring(xml_str)
        result: Optional[WebWunderResponse] = WebWunderFactory.parse_response(element)
        assert result is not None
        assert result.connection_type == "DSL"

    def test_parse_response_unknown_voucher_type(self) -> None:
        xml_str: str = PRODUCT_XML_ABSOLUTE_VOUCHER.replace(
            'xsi:type="ns2:absoluteVoucher"', 'xsi:type="ns2:unknownVoucherType"'
        )
        element: ET.Element = ET.fromstring(xml_str)
        result: Optional[WebWunderResponse] = WebWunderFactory.parse_response(element)
        assert result is not None
        assert result.voucher_type is None
        assert result.voucher_value_cents is None

    def test_parse_response_empty_numeric_tags_use_defaults(self) -> None:
        xml_str: str = """
        <ns2:products xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice">
            <ns2:productId>EMPTYNUM</ns2:productId>
            <ns2:providerName>Empty Numerics</ns2:providerName>
            <ns2:productInfo>
                <ns2:speed></ns2:speed>
                <ns2:monthlyCostInCent></ns2:monthlyCostInCent>
                <ns2:monthlyCostInCentFrom25thMonth></ns2:monthlyCostInCentFrom25thMonth>
                <ns2:contractDurationInMonths></ns2:contractDurationInMonths>
                <ns2:connectionType>Fiber</ns2:connectionType>
            </ns2:productInfo>
        </ns2:products>
        """
        element: ET.Element = ET.fromstring(xml_str)
        result: Optional[WebWunderResponse] = WebWunderFactory.parse_response(element)
        assert result is None


class TestWebWunderFactoryParseResponses:
    """Tests for WebWunderFactory.parse_responses method."""

    def test_parse_responses_all_valid(self) -> None:
        root_elem_abs: ET.Element = ET.fromstring(XML_EXAMPLE_ABSOLUTE_FULL)
        ns: Dict[str, str] = {
            "ns2": "http://webwunder.gendev7.check24.fun/offerservice"
        }
        product_elements_abs: List[ET.Element] = root_elem_abs.findall(
            ".//ns2:products", namespaces=ns
        )

        full_perc_xml_body = f"""
            <Output xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice">
                {PRODUCT_XML_PERCENTAGE_VOUCHER}
            </Output>
        """
        full_perc_xml = XML_EXAMPLE_PERCENTAGE_FULL.replace(
            XML_EXAMPLE_PERCENTAGE_FULL.split("<Output")[1].split("</Output>")[0],
            full_perc_xml_body.split("<Output")[1].split("</Output>")[0],
        )

        root_elem_perc: ET.Element = ET.fromstring(full_perc_xml)
        product_elements_perc: List[ET.Element] = root_elem_perc.findall(
            ".//ns2:products", namespaces=ns
        )

        all_elements: List[ET.Element] = product_elements_abs + product_elements_perc
        # Expect 2 from absolute, 1 from percentage example
        assert (
            len(all_elements) == 2 + 1
        ), f"Expected 3 elements, got {len(all_elements)}"

        results: List[WebWunderResponse] = WebWunderFactory.parse_responses(
            all_elements
        )
        assert len(results) == 3
        assert all(isinstance(r, WebWunderResponse) for r in results)

    def test_parse_responses_mixed_valid_invalid(self) -> None:
        valid_elem_xml: str = PRODUCT_XML_NO_VOUCHER
        invalid_elem_xml: str = """
        <ns2:products xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice">
            <ns2:providerName>Invalid Product Missing ID</ns2:providerName>
        </ns2:products>
        """
        elements: List[ET.Element] = [
            ET.fromstring(valid_elem_xml),
            ET.fromstring(invalid_elem_xml),
            ET.fromstring(PRODUCT_XML_CASHBACK_VOUCHER),
        ]
        results: List[WebWunderResponse] = WebWunderFactory.parse_responses(elements)
        assert len(results) == 2
        assert results[0].product_id == "NV01"
        assert results[1].product_id == "CB01"

    def test_parse_responses_empty_list(self) -> None:
        results: List[WebWunderResponse] = WebWunderFactory.parse_responses([])
        assert len(results) == 0


# --- Hypothesis Fuzz Testing ---
# Strategy for text that might be numeric or other arbitrary (but XML-safe) strings
# Filters out empty strings post-strip to ensure some content if text() generates just whitespace.
safe_text = st.text(
    alphabet=st.characters(
        max_codepoint=255, blacklist_categories=("Cs", "Cc")
    ),  # Avoid surrogates and control chars
    min_size=0,
    max_size=500,
).map(lambda s: s.strip())

maybe_numeric_text_strategy = st.one_of(
    safe_text,
    st.integers().map(str),
    st.floats(allow_nan=False, allow_infinity=False, min_value=-1e6, max_value=1e6).map(
        lambda f: f"{f:.2f}"
    ),  # Format float
)


@st.composite
def product_xml_strategy(draw: st.DrawFn) -> str:
    """Generates an XML string for a <products> element with fuzzed data."""
    esc = html.escape

    product_id_val: str = draw(safe_text.filter(lambda s: len(s) > 0))
    provider_name_val: str = draw(safe_text.filter(lambda s: len(s) > 0))

    product_id: str = esc(product_id_val)
    provider_name: str = esc(provider_name_val)
    speed: str = esc(draw(maybe_numeric_text_strategy))
    cost_intro: str = esc(draw(maybe_numeric_text_strategy))
    cost_regular: str = esc(draw(maybe_numeric_text_strategy))
    contract_months: str = esc(draw(maybe_numeric_text_strategy))
    connection_type: str = esc(
        draw(
            st.sampled_from(
                ["DSL", "Cable", "Fiber", "Mobile", "Unknown", "", "Fibre Optic"]
            )
        )
    )

    voucher_xml: str = ""
    if draw(st.booleans()):
        voucher_type_attr_val: str = draw(
            st.sampled_from(
                [
                    "ns2:absoluteVoucher",
                    "absoluteVoucher",
                    "ABSOLUTEVOUCHER",
                    "ns2:percentageVoucher",
                    "percentageVoucher",
                    "PERCENTAGEVOUCHER",
                    "ns2:cashbackVoucher",
                    "cashbackVoucher",
                    "CASHBACKVOUCHER",
                    "ns2:unknownVoucher",
                    "",
                    "otherType",
                ]
            )
        )
        voucher_content: str = ""
        if "absolute" in voucher_type_attr_val.lower():
            discount: str = esc(draw(maybe_numeric_text_strategy))
            min_order: str = esc(draw(maybe_numeric_text_strategy))
            voucher_content = f"<ns2:discountInCent>{discount}</ns2:discountInCent><ns2:minOrderValueInCent>{min_order}</ns2:minOrderValueInCent>"
        elif "percentage" in voucher_type_attr_val.lower():
            percentage: str = esc(draw(maybe_numeric_text_strategy))
            max_discount: str = esc(draw(maybe_numeric_text_strategy))
            voucher_content = f"<ns2:percentage>{percentage}</ns2:percentage><ns2:maxDiscountInCent>{max_discount}</ns2:maxDiscountInCent>"
        elif "cashback" in voucher_type_attr_val.lower():
            cashback: str = esc(draw(maybe_numeric_text_strategy))
            voucher_content = f"<ns2:cashbackInCent>{cashback}</ns2:cashbackInCent>"

        voucher_xml = f'<ns2:voucher xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="{esc(voucher_type_attr_val)}">{voucher_content}</ns2:voucher>'

    product_info_content_parts = []
    if draw(st.booleans()):
        product_info_content_parts.append(f"<ns2:speed>{speed}</ns2:speed>")
    if draw(st.booleans()):
        product_info_content_parts.append(
            f"<ns2:monthlyCostInCent>{cost_intro}</ns2:monthlyCostInCent>"
        )
    if draw(st.booleans()):
        product_info_content_parts.append(
            f"<ns2:monthlyCostInCentFrom25thMonth>{cost_regular}</ns2:monthlyCostInCentFrom25thMonth>"
        )
    if draw(st.booleans()):
        product_info_content_parts.append(voucher_xml)
    if draw(st.booleans()):
        product_info_content_parts.append(
            f"<ns2:contractDurationInMonths>{contract_months}</ns2:contractDurationInMonths>"
        )
    if draw(st.booleans()):
        product_info_content_parts.append(
            f"<ns2:connectionType>{connection_type}</ns2:connectionType>"
        )

    product_info_str = "".join(product_info_content_parts)

    if draw(st.booleans()):
        product_details_xml = f"<ns2:productInfo>{product_info_str}</ns2:productInfo>"
    else:
        product_details_xml = product_info_str

    # Corrected way to achieve weighted boolean choice for tag presence
    # 95% chance of being True (tag is present)
    include_pid_tag: bool = draw(
        st.integers(min_value=1, max_value=100).map(lambda x: x <= 95)
    )
    include_pname_tag: bool = draw(
        st.integers(min_value=1, max_value=100).map(lambda x: x <= 95)
    )

    pid_tag = f"<ns2:productId>{product_id}</ns2:productId>" if include_pid_tag else ""
    pname_tag = (
        f"<ns2:providerName>{provider_name}</ns2:providerName>"
        if include_pname_tag
        else ""
    )

    xml_doc: str = f"""<?xml version="1.0" encoding="UTF-8"?>
    <ns2:products xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice">
        {pid_tag}
        {pname_tag}
        {product_details_xml}
    </ns2:products>
    """
    return xml_doc


class TestWebWunderFactoryParseResponseFuzzing:
    """Fuzz testing for WebWunderFactory.parse_response using Hypothesis."""

    @hypothesis_settings(
        max_examples=200, deadline=None, suppress_health_check=[HealthCheck.too_slow]
    )  # Suppress too_slow if it becomes an issue with complex generation
    @given(xml_str=product_xml_strategy())
    def test_fuzz_parse_response_robustness(self, xml_str: str) -> None:
        try:
            element: ET.Element = ET.fromstring(xml_str)
        except ET.ParseError:
            return

        try:
            result: Optional[WebWunderResponse] = WebWunderFactory.parse_response(
                element
            )

            assert result is None or isinstance(
                result, WebWunderResponse
            ), f"Parser returned an unexpected type: {type(result)}. XML: {xml_str}"

            if result is not None:
                assert (
                    isinstance(result.provider_name, str)
                    and len(result.provider_name) > 0
                )
                assert isinstance(result.product_id, str) and len(result.product_id) > 0
                assert result.speed_down_mbit >= 0
                assert result.price_cents_month_intro >= 0
                assert result.price_cents_month_regular is None or result.price_cents_month_regular >= 0
                assert result.contract_duration_months >= 0
                if result.voucher_type == VoucherKind.PERCENTAGE:
                    assert result.voucher_value_percent is not None
                    assert (
                        0 <= result.voucher_value_percent <= 100
                        if result.voucher_value_percent is not None
                        else True
                    )
                    assert (
                        result.voucher_max_value_cents is not None
                        and result.voucher_max_value_cents >= 0
                    )
                if result.voucher_type == VoucherKind.ABSOLUTE:
                    assert (
                        result.voucher_value_cents is not None
                        and result.voucher_value_cents >= 0
                    )
                    assert (
                        result.voucher_min_order_value_cents is not None
                        and result.voucher_min_order_value_cents >= 0
                    )
                if result.voucher_type == VoucherKind.CASHBACK:
                    if result.voucher_value_cents is not None:
                        assert result.voucher_value_cents >= 0

        except ValidationError:
            pytest.fail(
                f"Pydantic ValidationError leaked from parse_response. XML: {xml_str}"
            )
        except Exception as e:
            pytest.fail(
                f"WebWunderFactory.parse_response raised an unexpected low-level exception: "
                f"{type(e).__name__}: {e}. XML:\n{xml_str}"
            )
