from typing import Any, Dict, List, Optional
from unittest.mock import patch, MagicMock

import pytest

from app.factories.pingperfect_factory import PingPerfectFactory
from app.models import Address

PATCH_GET_SETTINGS = "app.core.config.get_settings"

# Patches for 'time' and 'sign' (where they are IMPORTED AND USED BY the factory)
PATCH_TIME = "app.factories.pingperfect_factory.time"
PATCH_SIGN = "app.factories.pingperfect_factory.sign"

# Real-world example data provided by the user
REAL_WORLD_EXAMPLE_DATA: List[Dict[str, Any]] = [
    {
        "providerName": "Ping Basic 30",
        "productInfo": {
            "speed": 30,
            "contractDurationInMonths": 12,
            "connectionType": "DSL",
            "tv": "PING TV",
            "limitFrom": None,
            "maxAge": None,
        },
        "pricingDetails": {"monthlyCostInCent": 2651, "installationService": "no"},
    },
    {
        "providerName": "Ping Basic 50",  # Invalid: productInfo and pricingDetails are null
        "productInfo": None,
        "pricingDetails": None,
    },
    {
        "providerName": "Ping Basic 75",
        "productInfo": {
            "speed": 75,
            "contractDurationInMonths": 12,
            "connectionType": "DSL",
            "tv": "PING TV",
            "limitFrom": None,
            "maxAge": None,
        },
        "pricingDetails": {"monthlyCostInCent": 3051, "installationService": "no"},
    },
    {
        "providerName": "Ping Plus 75",  # Invalid
        "productInfo": None,
        "pricingDetails": None,
    },
    {
        "providerName": "Ping Plus 100",
        "productInfo": {
            "speed": 100,
            "contractDurationInMonths": 12,
            "connectionType": "CABLE",
            "tv": "PING TV Plus",
            "limitFrom": None,
            "maxAge": None,
        },
        "pricingDetails": {"monthlyCostInCent": 3451, "installationService": "no"},
    },
    {
        "providerName": "Ping Plus 125",  # Invalid
        "productInfo": None,
        "pricingDetails": None,
    },
    {
        "providerName": "Ping Premium 125",
        "productInfo": {
            "speed": 125,
            "contractDurationInMonths": 24,
            "connectionType": "FIBER",
            "tv": "Pong TV Premium",
            "limitFrom": None,
            "maxAge": None,
        },
        "pricingDetails": {"monthlyCostInCent": 3851, "installationService": "no"},
    },
    {
        "providerName": "Ping Premium 150",  # Invalid
        "productInfo": None,
        "pricingDetails": None,
    },
    {
        "providerName": "Ping Premium 175",
        "productInfo": {
            "speed": 175,
            "contractDurationInMonths": 24,
            "connectionType": "FIBER",
            "tv": "Pong TV Premium",
            "limitFrom": None,
            "maxAge": None,
        },
        "pricingDetails": {"monthlyCostInCent": 4251, "installationService": "no"},
    },
    {
        "providerName": "Ping Ultra 175",  # Invalid
        "productInfo": None,
        "pricingDetails": None,
    },
    {
        "providerName": "Ping Ultra 200",
        "productInfo": {
            "speed": 200,
            "contractDurationInMonths": 24,
            "connectionType": "FIBER",
            "tv": "Ping Pong TV",
            "limitFrom": None,
            "maxAge": None,
        },
        "pricingDetails": {"monthlyCostInCent": 4651, "installationService": "no"},
    },
    {
        "providerName": "Ping Ultra 225",  # Invalid
        "productInfo": None,
        "pricingDetails": None,
    },
    {
        "providerName": "Ping Extreme 250",
        "productInfo": {
            "speed": 250,
            "contractDurationInMonths": 36,
            "connectionType": "FIBER",
            "tv": "Ping Pong TV+",
            "limitFrom": None,
            "maxAge": None,
        },
        "pricingDetails": {"monthlyCostInCent": 5151, "installationService": "no"},
    },
    {
        "providerName": "Ping Extreme 300",  # Invalid
        "productInfo": None,
        "pricingDetails": None,
    },
    {
        "providerName": "Ping Extreme 350",
        "productInfo": {
            "speed": 350,
            "contractDurationInMonths": 36,
            "connectionType": "FIBER",
            "tv": "Ping Pong TV+",
            "limitFrom": None,
            "maxAge": None,
        },
        "pricingDetails": {
            "monthlyCostInCent": 5751,
            "installationService": "yes",
        },
    },
]


@pytest.fixture
def sample_address() -> Address:
    """Provides a sample Address object for testing."""
    return Address(
        street="Musterstraße",
        house_number="123b",
        plz="10115",
        city="Berlin",
        country_code="DE",
    )


def _generate_expected_product_id(provider_name: str, speed: Any, term: Any) -> str:
    """Helper to generate product_id consistent with factory logic."""
    import uuid

    return uuid.uuid5(uuid.NAMESPACE_DNS, f"{provider_name}-{speed}-{term}").hex


class TestPingPerfectFactoryParseResponse:
    """
    Tests for the PingPerfectFactory.parse_response method.
    Focuses on parsing various forms of single item data into PingPerfectResponse.
    """

    @pytest.mark.parametrize(
        "item_data, expected_response_dict",
        [
            # Case 1: Valid item from REAL_WORLD_EXAMPLE_DATA (Ping Basic 30)
            (
                REAL_WORLD_EXAMPLE_DATA[0],
                {
                    "provider_name": "Ping Basic 30",
                    "product_id": _generate_expected_product_id(
                        "Ping Basic 30", 30, 12
                    ),
                    "speed_down_mbit": 30,
                    "connection_type": "DSL",
                    "data_cap_gb": None,
                    "price_cents_month": 2651,
                    "contract_duration_months": 12,
                    "installation_service_included": False,
                    "tv_included": True,
                    "tv_package_name": "PING TV",
                    "voucher_type": None,
                    "voucher_value_cents": None,
                    "max_age": None,
                },
            ),
            # Case 2: Another valid item (Ping Extreme 350 with installationService="yes")
            (
                REAL_WORLD_EXAMPLE_DATA[-1],
                {
                    "provider_name": "Ping Extreme 350",
                    "product_id": _generate_expected_product_id(
                        "Ping Extreme 350", 350, 36
                    ),
                    "speed_down_mbit": 350,
                    "connection_type": "FIBER",
                    "data_cap_gb": None,
                    "price_cents_month": 5751,
                    "contract_duration_months": 36,
                    "installation_service_included": True,
                    "tv_included": True,
                    "tv_package_name": "Ping Pong TV+",
                    "max_age": None,
                },
            ),
        ],
    )
    def test_parse_response_valid_data(
        self, item_data: Dict[str, Any], expected_response_dict: Dict[str, Any]
    ) -> None:
        """Test parsing of various valid item structures."""
        result = PingPerfectFactory.parse_response(item_data)
        assert result is not None
        # Convert result to dict for easier comparison, excluding fields not in expected
        result_dict = result.model_dump(include=set(expected_response_dict.keys()))
        assert result_dict == expected_response_dict

    @pytest.mark.parametrize(
        "item_data",
        [
            {
                "providerName": "Invalid Item 1",
                "productInfo": None,
                "pricingDetails": {"monthlyCostInCent": 1000},
            },
            {
                "providerName": "Invalid Item 2",
                "productInfo": {"speed": 50},
                "pricingDetails": None,
            },
            {},  # Empty dictionary
            {
                "productInfo": {"speed": 50},
                "pricingDetails": {"monthlyCostInCent": 1000},
            },  # Missing providerName
            {
                "providerName": "",
                "productInfo": {"speed": 10, "contractDurationInMonths": 1},
                "pricingDetails": {"monthlyCostInCent": 1000},
            },  # Empty providerName
            # Minimal plan now considered invalid due to required contract_duration_months
            {
                "providerName": "Minimal Valid Plan",
                "productInfo": {"speed": 50},
                "pricingDetails": {"monthlyCostInCent": 2000},
            },
            # Test Plan Nulls case here as an invalid input
            {
                "providerName": "Test Plan Nulls",
                "productInfo": {
                    "speed": None,
                    "contractDurationInMonths": None,
                    "connectionType": "Cable",
                    "tv": None,
                    "limitFrom": "100",
                    "maxAge": "27",
                },
                "pricingDetails": {
                    "monthlyCostInCent": None,
                    "installationService": "INCLUDED ",
                },
            },
        ],
    )
    def test_parse_response_invalid_data_returns_none(
        self, item_data: Dict[str, Any]
    ) -> None:
        """Test that invalid item structures return None."""
        assert PingPerfectFactory.parse_response(item_data) is None

    @pytest.mark.parametrize(
        "installation_service_value, expected_included_bool",
        [
            ("yes", True),
            ("YES", True),
            (" Yes ", True),
            ("included", True),
            ("INCLUDED", True),
            (" Included ", True),
            ("true", True),
            ("TRUE", True),
            (" True ", True),
            ("no", False),
            ("NO", False),
            (" No ", False),
            ("false", False),
            ("any_other_string", False),
            ("", False),
            (None, False),  # Key missing yields default False
        ],
    )
    def test_parse_response_installation_service_logic(
        self, installation_service_value: Optional[str], expected_included_bool: bool
    ) -> None:
        """Test the logic for 'installation_service_included' field."""
        item_data: Dict[str, Any] = {
            "providerName": "Test Install Service",
            "productInfo": {
                "speed": 50,
                "contractDurationInMonths": 12,
                "connectionType": "DSL",
            },
            "pricingDetails": {"monthlyCostInCent": 1000},
        }
        if installation_service_value is not None:
            item_data["pricingDetails"][
                "installationService"
            ] = installation_service_value

        result = PingPerfectFactory.parse_response(item_data)
        assert result is not None
        assert result.installation_service_included == expected_included_bool

    @pytest.mark.parametrize(
        "tv_value, expected_tv_included, expected_tv_package_name",
        [
            ("PING TV Basic", True, "PING TV Basic"),
            ("", False, None),  # empty_string_to_none now converts "" to None
            (None, False, None),
        ],
    )
    def test_parse_response_tv_logic(
        self,
        tv_value: Optional[str],
        expected_tv_included: bool,
        expected_tv_package_name: Optional[str],
    ) -> None:
        """Test logic for 'tv_included' and 'tv_package_name'."""
        item_data: Dict[str, Any] = {
            "providerName": "Test TV",
            "productInfo": {
                "speed": 50,
                "contractDurationInMonths": 12,
                "tv": tv_value,
                "connectionType": "DSL",
            },
            "pricingDetails": {"monthlyCostInCent": 1000},
        }
        result = PingPerfectFactory.parse_response(item_data)
        assert result is not None
        assert result.tv_included == expected_tv_included
        assert result.tv_package_name == expected_tv_package_name

    def test_parse_response_field_type_coercion(self) -> None:
        """Test that string representations of numbers are correctly coerced to int."""
        item_data: Dict[str, Any] = {
            "providerName": "Type Coercion Test",
            "productInfo": {
                "speed": "100",
                "contractDurationInMonths": "24",
                "connectionType": "DSL",
                "limitFrom": "500",
                "maxAge": "30",
            },
            "pricingDetails": {
                "monthlyCostInCent": "3000",
                "installationService": "no",
            },
        }
        expected_product_id = _generate_expected_product_id(
            "Type Coercion Test", "100", "24"
        )

        result = PingPerfectFactory.parse_response(item_data)
        assert result is not None
        assert result.product_id == expected_product_id
        assert result.speed_down_mbit == 100
        assert result.contract_duration_months == 24
        assert result.data_cap_gb == 500
        assert result.max_age == 30
        assert result.price_cents_month == 3000

    def test_parse_response_connection_type_normalization(self) -> None:
        """Test that no unintended normalization happens at the response stage."""
        item_data: Dict[str, Any] = {
            "providerName": "ConnTypeTest",
            "productInfo": {
                "speed": 50,
                "contractDurationInMonths": 12,
                "connectionType": "cAbLe",
            },
            "pricingDetails": {"monthlyCostInCent": 1000},
        }
        result = PingPerfectFactory.parse_response(item_data)
        assert result is not None
        assert result.connection_type == "cAbLe"


# --- Tests for PingPerfectFactory.parse_responses ---
@patch("app.factories.pingperfect_factory.logger")
class TestPingPerfectFactoryParseResponses:
    """
    Tests for the PingPerfectFactory.parse_responses method.
    Ensures correct processing of lists of items, including handling of invalid items.
    """

    def test_parse_responses_empty_list(self, mock_logger: MagicMock) -> None:
        """Test with an empty list of raw items."""
        results = PingPerfectFactory.parse_responses([])
        assert results == []
        mock_logger.warning.assert_not_called()

    def test_parse_responses_all_valid(self, mock_logger: MagicMock) -> None:
        """Test with a list containing only valid items."""
        valid_items = [
            REAL_WORLD_EXAMPLE_DATA[0],  # Ping Basic 30
            REAL_WORLD_EXAMPLE_DATA[2],  # Ping Basic 75
        ]
        results = PingPerfectFactory.parse_responses(valid_items)
        assert len(results) == 2
        assert results[0].provider_name == "Ping Basic 30"
        assert results[1].provider_name == "Ping Basic 75"
        mock_logger.warning.assert_not_called()

    def test_parse_responses_all_invalid(self, mock_logger: MagicMock) -> None:
        """Test with a list containing only invalid items."""
        invalid_items = [
            REAL_WORLD_EXAMPLE_DATA[1],  # Ping Basic 50 (invalid)
            {
                "providerName": "Missing Info",
                "pricingDetails": {"monthlyCostInCent": 100},
            },  # Missing productInfo
        ]
        results = PingPerfectFactory.parse_responses(invalid_items)
        assert results == []

    def test_parse_responses_mixed_valid_and_invalid(
        self, mock_logger: MagicMock
    ) -> None:
        """Test with a list containing a mix of valid and invalid items."""
        mixed_items = [
            REAL_WORLD_EXAMPLE_DATA[0],  # Valid (Ping Basic 30)
            REAL_WORLD_EXAMPLE_DATA[1],  # Invalid (Ping Basic 50)
            REAL_WORLD_EXAMPLE_DATA[2],  # Valid (Ping Basic 75)
        ]
        results = PingPerfectFactory.parse_responses(mixed_items)

        assert len(results) == 2
        assert results[0].provider_name == "Ping Basic 30"
        assert results[1].provider_name == "Ping Basic 75"

    def test_parse_responses_with_real_world_data(self, mock_logger: MagicMock) -> None:
        """Test parsing using the full REAL_WORLD_EXAMPLE_DATA list."""
        results = PingPerfectFactory.parse_responses(REAL_WORLD_EXAMPLE_DATA)

        # There are 15 raw items, 7 invalid → 8 valid
        assert len(results) == 8

        expected_provider_names_ordered = [
            "Ping Basic 30",
            "Ping Basic 75",
            "Ping Plus 100",
            "Ping Premium 125",
            "Ping Premium 175",
            "Ping Ultra 200",
            "Ping Extreme 250",
            "Ping Extreme 350",
        ]
        parsed_provider_names = [res.provider_name for res in results]
        assert parsed_provider_names == expected_provider_names_ordered


# +++ Hypothesis-based fuzz testing +++
from hypothesis import (
    given,
    strategies as st,
    settings as hypothesis_settings,
    HealthCheck,
)
import uuid

from app.models.providers.responses.pingperfect_response import PingPerfectResponse


# Strategies for fuzzing
st_optional_text = st.one_of(st.none(), st.text(min_size=0, max_size=50))
st_numeric_field_input = st.one_of(
    st.none(),
    st.integers(min_value=0, max_value=1_000_000),
    st.text(min_size=1, max_size=10).filter(
        lambda x: x.isdigit() or (x.startswith("-") and x[1:].isdigit())
    ),
)
st_maxage_input = st.one_of(
    st.none(),
    st.integers(min_value=0, max_value=120),
    st.text(min_size=1, max_size=3).filter(lambda x: x.isdigit()),
)

st_product_info = st.fixed_dictionaries(
    {
        "speed": st_numeric_field_input,
        "contractDurationInMonths": st_numeric_field_input,
    },
    optional={
        "connectionType": st_optional_text,
        "tv": st_optional_text,
        "limitFrom": st_numeric_field_input,
        "maxAge": st_maxage_input,
    },
)
st_pricing_details = st.fixed_dictionaries(
    {"monthlyCostInCent": st_numeric_field_input},
    optional={"installationService": st_optional_text},
)
st_structured_item_data = st.builds(
    dict,
    providerName=st_optional_text,
    productInfo=st.one_of(st.none(), st_product_info),
    pricingDetails=st.one_of(st.none(), st_pricing_details),
).map(
    lambda d: {
        k: v
        for k, v in d.items()
        if v is not None or k in ("providerName", "productInfo", "pricingDetails")
    }
)


class TestPingPerfectFactoryParseResponseHypothesis:
    """
    Property-based tests for PingPerfectFactory.parse_response using Hypothesis.
    """

    @given(item_data=st_structured_item_data)
    @hypothesis_settings(
        suppress_health_check=[
            HealthCheck.too_slow,
            HealthCheck.data_too_large,
            HealthCheck.filter_too_much,
        ],
        deadline=None,
        max_examples=200,
    )
    def test_parse_response_fuzzing_does_not_raise_unexpected_errors(
        self, item_data: Dict[str, Any]
    ) -> None:
        try:
            result = PingPerfectFactory.parse_response(item_data)
            # Either a valid PingPerfectResponse or None is acceptable—no low-level errors
            if result is not None:
                assert isinstance(result, PingPerfectResponse)
                try:
                    uuid.UUID(hex=result.product_id)
                except ValueError:
                    pytest.fail(f"Invalid UUID hex: {result.product_id}")
        except Exception as e:
            pytest.fail(
                f"Unexpected exception {e.__class__.__name__}: {e} for item: {item_data}"
            )

    @given(raw_items=st.lists(st_structured_item_data, min_size=0, max_size=10))
    @hypothesis_settings(
        suppress_health_check=[
            HealthCheck.too_slow,
            HealthCheck.data_too_large,
            HealthCheck.filter_too_much,
        ],
        deadline=None,
        max_examples=50,
    )
    def test_parse_responses_fuzzing_does_not_raise_unexpected_errors(
        self, raw_items: List[Dict[str, Any]]
    ) -> None:
        try:
            results = PingPerfectFactory.parse_responses(raw_items)
            assert isinstance(results, list)
            for item in results:
                assert isinstance(item, PingPerfectResponse)
        except Exception as e:
            pytest.fail(
                f"Unexpected exception {e.__class__.__name__}: {e} for raw_items: {raw_items}"
            )
