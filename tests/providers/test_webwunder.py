# tests/providers/test_webwunder_provider.py

from __future__ import annotations

from typing import List, Dict, Any, cast
from unittest.mock import AsyncMock, MagicMock # MagicMock for creating ad-hoc mock objects

import httpx
import pytest
from loguru import logger
from pydantic import ValidationError
from pytest_mock import MockerFixture # For type hinting the mocker fixture

from app.core.config import Settings, get_settings
from app.core.retry_config import RetryConfig
from app.factories.webwunder_factory import WebWunderFactory
from app.models import Address, Offer
from app.models.base.offer import VoucherKind
from app.models.providers.webwunder_response import WebWunderResponse as WebWunderPydanticResponse
from app.providers.base import ProviderError
from app.providers.webwunder import WebWunderProvider

# It's crucial to have pytest-mock installed for the 'mocker' fixture to work.
# You can install it via: pip install pytest-mock

# Sample XML Response based on user-provided example
# Includes one item with a voucher and one without for variety.
SAMPLE_SUCCESS_XML_RESPONSE: str = """
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
                    <ns2:contractDurationInMonths>12</ns2:contractDurationInMonths>
                    <ns2:connectionType>Cable</ns2:connectionType>
                </ns2:productInfo>
            </ns2:products>
        </Output>
    </SOAP-ENV:Body>
</SOAP-ENV:Envelope>
"""

MALFORMED_XML_RESPONSE: str = "<malformed_xml"

SOAP_FAULT_XML_RESPONSE: str = """
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
    <SOAP-ENV:Body>
        <SOAP-ENV:Fault>
            <faultcode>Server</faultcode>
            <faultstring>Internal Server Error</faultstring>
        </SOAP-ENV:Fault>
    </SOAP-ENV:Body>
</SOAP-ENV:Envelope>
"""

EMPTY_PRODUCTS_XML_RESPONSE: str = """
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
    <SOAP-ENV:Body>
        <Output xmlns:ns2="http://webwunder.gendev7.check24.fun/offerservice">
            <!-- No ns2:products here -->
        </Output>
    </SOAP-ENV:Body>
</SOAP-ENV:Envelope>
"""


@pytest.fixture
def sample_address() -> Address:
    """Provides a sample Address object for testing."""
    return Address(
        street="Testallee",
        house_number="101",
        plz="81234",
        city="Musterstadt",
        country_code="DE",
    )


@pytest.fixture
def test_settings() -> Settings:
    """
    Provides Settings instance. Relies on conftest.py for env var setup.
    """
    return get_settings()


@pytest.fixture
def webwunder_provider(test_settings: Settings) -> WebWunderProvider:
    """
    Provides a WebWunderProvider instance with a mocked HTTPX client
    and a retry configuration that disables retries for predictable testing.
    """
    mock_client: AsyncMock = AsyncMock(spec=httpx.AsyncClient)
    # Disable retries for unit tests to focus on single attempt logic
    retry_cfg: RetryConfig = RetryConfig(max_retries=0, backoff_factor=0.01)
    provider: WebWunderProvider = WebWunderProvider(
        client=cast(httpx.AsyncClient, mock_client), retry_config=retry_cfg
    )
    return provider


def create_mock_httpx_response(
        content: str, status_code: int, headers: Dict[str, str] | None = None
) -> httpx.Response:
    """Helper function to create a mock httpx.Response object."""
    if headers is None:
        headers = {"Content-Type": "text/xml; charset=utf-8"}
    mock_request: httpx.Request = httpx.Request("POST", "https://mock.test.url/endpoint")
    return httpx.Response(
        status_code, content=content.encode("utf-8"), headers=headers, request=mock_request
    )


@pytest.mark.asyncio
async def test_fetch_success(
        webwunder_provider: WebWunderProvider,
        sample_address: Address,
        test_settings: Settings,
        mocker: MockerFixture, # Use MockerFixture for type hint
        caplog: pytest.LogCaptureFixture,
) -> None:
    """
    Tests the successful scenario of fetching and processing offers from WebWunder.
    Verifies:
    - Correct XML request generation.
    - Correct HTTP POST call with appropriate headers, URL, and timeout.
    - Correct parsing of a successful XML response.
    - Transformation of parsed data into Offer objects.
    - Informative logging at various stages.
    """
    # --- Arrange ---
    mock_xml_request: str = "<soap:Envelope><soap:Body>MockRequest</soap:Body></soap:Envelope>"
    mocker.patch.object(WebWunderFactory, "build_xml", return_value=mock_xml_request)

    mock_successful_http_response: httpx.Response = create_mock_httpx_response(
        SAMPLE_SUCCESS_XML_RESPONSE, 200
    )
    cast(AsyncMock, webwunder_provider.client.post).return_value = mock_successful_http_response

    mock_xml_root_element: MagicMock = MagicMock()
    mock_product_xml_elements: List[MagicMock] = [MagicMock(tag="product1"), MagicMock(tag="product2")]
    mock_xml_root_element.iterfind.return_value = mock_product_xml_elements
    mocker.patch.object(WebWunderFactory, "postprocess_response", return_value=mock_xml_root_element)

    mock_pydantic_resp1 = WebWunderPydanticResponse(
        provider_name="WebWunder Starter 20", product_id="401", speed_down_mbit=20,
        price_cents_month_intro=2218, price_cents_month_regular=2418,
        contract_duration_months=12, connection_type="DSL",
        voucher_type=VoucherKind.ABSOLUTE, voucher_value_cents=10763,
        voucher_min_order_value_cents=763,
    )
    mock_pydantic_resp2 = WebWunderPydanticResponse(
        provider_name="WebWunder Starter 30", product_id="402", speed_down_mbit=30,
        price_cents_month_intro=2418, price_cents_month_regular=2218,
        contract_duration_months=12, connection_type="Cable",
    )
    mock_parsed_pydantic_responses: List[WebWunderPydanticResponse] = [
        mock_pydantic_resp1, mock_pydantic_resp2
    ]
    mocker.patch.object(WebWunderFactory, "parse_responses", return_value=mock_parsed_pydantic_responses)

    # Spy on the to_offer method of each Pydantic response model
    # These are instance methods, so we spy on the instances
    spy_to_offer1 = mocker.spy(mock_pydantic_resp1, "to_offer")
    spy_to_offer2 = mocker.spy(mock_pydantic_resp2, "to_offer")


    expected_offers: List[Offer] = [
        mock_pydantic_resp1.to_offer(webwunder_provider.name), # Call to generate expected
        mock_pydantic_resp2.to_offer(webwunder_provider.name), # Call to generate expected
    ]
    # Reset spies if to_offer was called during expected_offers generation above
    # This depends on how the spy interacts with the original method call.
    # Often, it's cleaner to create expected offers *before* spying if they are generated by the same method.
    # Or, adjust spy calls based on when the actual call in SUT happens.
    # For this case, we expect to_offer to be called *within* the SUT, so the spies are for those calls.

    # --- Act ---
    with caplog.at_level(logger.INFO):
        actual_offers: List[Offer] = await webwunder_provider.fetch(sample_address)

    # --- Assert ---
    WebWunderFactory.build_xml.assert_called_once_with(sample_address) # type: ignore[attr-defined]

    expected_headers: Dict[str, str] = {
        "Content-Type": "text/xml; charset=utf-8",
        "X-Api-Key": test_settings.webwunder_api_key,
        "SOAPAction": "legacyGetInternetOffers",
    }
    cast(AsyncMock, webwunder_provider.client.post).assert_called_once_with(
        test_settings.webwunder_wsdl,
        content=mock_xml_request,
        headers=expected_headers,
        timeout=10,
    )

    WebWunderFactory.postprocess_response.assert_called_once_with(mock_successful_http_response) # type: ignore[attr-defined]
    mock_xml_root_element.iterfind.assert_called_once_with(".//{*}products")
    WebWunderFactory.parse_responses.assert_called_once_with(mock_product_xml_elements) # type: ignore[attr-defined]

    # Assert that spy_to_offer1 and spy_to_offer2 were called
    spy_to_offer1.assert_called_once_with(webwunder_provider.name)
    spy_to_offer2.assert_called_once_with(webwunder_provider.name)

    assert actual_offers == expected_offers
    assert len(actual_offers) == len(expected_offers)

    assert f"WebWunderProvider.fetch – {sample_address.street} {sample_address.house_number}, {sample_address.plz} {sample_address.city}" in caplog.text
    assert f"WebWunderProvider HTTP {mock_successful_http_response.status_code} in" in caplog.text
    assert f"WebWunderProvider → found {len(mock_product_xml_elements)} <products> nodes" in caplog.text
    assert f"WebWunderProvider → returning {len(expected_offers)} offers" in caplog.text


@pytest.mark.asyncio
async def test_fetch_http_client_request_error(
        webwunder_provider: WebWunderProvider,
        sample_address: Address,
        test_settings: Settings,
        mocker: MockerFixture,
        caplog: pytest.LogCaptureFixture,
) -> None:
    """
    Tests that a ProviderError is raised with contextual information
    when the HTTP client.post call raises an httpx.RequestError (e.g., network issue).
    """
    # --- Arrange ---
    mock_xml_request: str = "<xml/>"
    mocker.patch.object(WebWunderFactory, "build_xml", return_value=mock_xml_request)

    http_exception: httpx.RequestError = httpx.RequestError(
        "Simulated network error", request=httpx.Request("POST", test_settings.webwunder_wsdl)
    )
    cast(AsyncMock, webwunder_provider.client.post).side_effect = http_exception

    # --- Act & Assert ---
    with caplog.at_level(logger.ERROR):
        with pytest.raises(ProviderError) as exc_info:
            await webwunder_provider.fetch(sample_address)

    assert "WebWunder request failed: Simulated network error" in str(exc_info.value)
    assert exc_info.value.__cause__ is http_exception

    assert "WebWunderProvider HTTP failure: Simulated network error" in caplog.text
    assert any(record.exc_info is not None for record in caplog.records if record.levelname == "ERROR")


@pytest.mark.asyncio
async def test_fetch_http_status_error_soap_fault(
        webwunder_provider: WebWunderProvider,
        sample_address: Address,
        test_settings: Settings,
        mocker: MockerFixture,
        caplog: pytest.LogCaptureFixture,
) -> None:
    """
    Tests ProviderError when the server returns a non-2xx status (e.g., 500)
    with a SOAP Fault, leading to no product elements being found.
    """
    # --- Arrange ---
    mock_xml_request: str = "<xml/>"
    mocker.patch.object(WebWunderFactory, "build_xml", return_value=mock_xml_request)

    mock_server_error_response: httpx.Response = create_mock_httpx_response(SOAP_FAULT_XML_RESPONSE, 500)
    cast(AsyncMock, webwunder_provider.client.post).return_value = mock_server_error_response

    mock_xml_root_from_fault: MagicMock = MagicMock()
    mock_xml_root_from_fault.iterfind.return_value = []
    mocker.patch.object(WebWunderFactory, "postprocess_response", return_value=mock_xml_root_from_fault)

    # --- Act & Assert ---
    with caplog.at_level(logger.INFO):
        with pytest.raises(ProviderError) as exc_info:
            await webwunder_provider.fetch(sample_address)

    assert "WebWunder response contained no products" in str(exc_info.value)

    assert f"WebWunderProvider HTTP {mock_server_error_response.status_code} in" in caplog.text
    assert "WebWunderProvider → found 0 <products> nodes" in caplog.text


@pytest.mark.asyncio
async def test_fetch_response_ok_but_no_products(
        webwunder_provider: WebWunderProvider,
        sample_address: Address,
        mocker: MockerFixture,
        caplog: pytest.LogCaptureFixture,
) -> None:
    """
    Tests ProviderError if the HTTP response is 200 OK but the XML content
    parsed results in zero <products> elements.
    """
    # --- Arrange ---
    mock_xml_request: str = "<xml/>"
    mocker.patch.object(WebWunderFactory, "build_xml", return_value=mock_xml_request)

    mock_ok_empty_products_response: httpx.Response = create_mock_httpx_response(EMPTY_PRODUCTS_XML_RESPONSE, 200)
    cast(AsyncMock, webwunder_provider.client.post).return_value = mock_ok_empty_products_response

    mock_xml_root_empty: MagicMock = MagicMock()
    mock_xml_root_empty.iterfind.return_value = []
    mocker.patch.object(WebWunderFactory, "postprocess_response", return_value=mock_xml_root_empty)

    # --- Act & Assert ---
    with caplog.at_level(logger.INFO):
        with pytest.raises(ProviderError) as exc_info:
            await webwunder_provider.fetch(sample_address)

    assert "WebWunder response contained no products" in str(exc_info.value)

    assert f"WebWunderProvider HTTP {mock_ok_empty_products_response.status_code} in" in caplog.text
    assert "WebWunderProvider → found 0 <products> nodes" in caplog.text
    WebWunderFactory.parse_responses.assert_not_called() # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_fetch_factory_build_xml_raises_error(
        webwunder_provider: WebWunderProvider,
        sample_address: Address,
        mocker: MockerFixture,
        caplog: pytest.LogCaptureFixture,
) -> None:
    """
    Tests that an exception raised by WebWunderFactory.build_xml propagates correctly.
    """
    # --- Arrange ---
    build_xml_error: ValueError = ValueError("Failed to build XML request")
    mocker.patch.object(WebWunderFactory, "build_xml", side_effect=build_xml_error)

    # --- Act & Assert ---
    with caplog.at_level(logger.INFO):
        with pytest.raises(ValueError, match="Failed to build XML request") as exc_info:
            await webwunder_provider.fetch(sample_address)

    assert exc_info.value is build_xml_error
    assert f"WebWunderProvider.fetch – {sample_address.street}" in caplog.text
    cast(AsyncMock, webwunder_provider.client.post).assert_not_called()


@pytest.mark.asyncio
async def test_fetch_factory_postprocess_response_raises_error(
        webwunder_provider: WebWunderProvider,
        sample_address: Address,
        mocker: MockerFixture,
        caplog: pytest.LogCaptureFixture,
) -> None:
    """
    Tests that an exception from WebWunderFactory.postprocess_response propagates.
    """
    # --- Arrange ---
    mock_xml_request: str = "<xml/>"
    mocker.patch.object(WebWunderFactory, "build_xml", return_value=mock_xml_request)

    mock_malformed_http_response: httpx.Response = create_mock_httpx_response(MALFORMED_XML_RESPONSE, 200)
    cast(AsyncMock, webwunder_provider.client.post).return_value = mock_malformed_http_response

    postprocess_exception: ValueError = ValueError("XML postprocessing failed")
    mocker.patch.object(WebWunderFactory, "postprocess_response", side_effect=postprocess_exception)

    # --- Act & Assert ---
    with caplog.at_level(logger.INFO):
        with pytest.raises(ValueError, match="XML postprocessing failed") as exc_info:
            await webwunder_provider.fetch(sample_address)

    assert exc_info.value is postprocess_exception
    assert f"WebWunderProvider.fetch – {sample_address.street}" in caplog.text
    assert f"WebWunderProvider HTTP {mock_malformed_http_response.status_code} in" in caplog.text
    assert "found" not in caplog.text
    assert "returning" not in caplog.text


@pytest.mark.asyncio
async def test_fetch_factory_parse_responses_raises_error(
        webwunder_provider: WebWunderProvider,
        sample_address: Address,
        mocker: MockerFixture,
        caplog: pytest.LogCaptureFixture,
) -> None:
    """
    Tests that an exception from WebWunderFactory.parse_responses propagates.
    """
    # --- Arrange ---
    mock_xml_request: str = "<xml/>"
    mocker.patch.object(WebWunderFactory, "build_xml", return_value=mock_xml_request)

    mock_successful_http_response: httpx.Response = create_mock_httpx_response(SAMPLE_SUCCESS_XML_RESPONSE, 200)
    cast(AsyncMock, webwunder_provider.client.post).return_value = mock_successful_http_response

    mock_xml_root_element: MagicMock = MagicMock()
    mock_product_xml_elements: List[MagicMock] = [MagicMock()]
    mock_xml_root_element.iterfind.return_value = mock_product_xml_elements
    mocker.patch.object(WebWunderFactory, "postprocess_response", return_value=mock_xml_root_element)

    parse_exception: ValidationError = ValidationError.from_exception_data(
        title="WebWunderResponse",
        line_errors=[{"type": "missing", "loc": ("field",), "msg": "Field required", "input": {}}]
    )
    mocker.patch.object(WebWunderFactory, "parse_responses", side_effect=parse_exception)

    # --- Act & Assert ---
    with caplog.at_level(logger.INFO):
        with pytest.raises(ValidationError) as exc_info:
            await webwunder_provider.fetch(sample_address)

    assert exc_info.value is parse_exception
    assert f"WebWunderProvider.fetch – {sample_address.street}" in caplog.text
    assert f"WebWunderProvider HTTP {mock_successful_http_response.status_code} in" in caplog.text
    assert f"WebWunderProvider → found {len(mock_product_xml_elements)} <products> nodes" in caplog.text
    assert "returning" not in caplog.text