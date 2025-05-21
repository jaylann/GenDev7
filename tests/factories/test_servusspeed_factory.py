from typing import Dict, Any

import pytest
import math
from hypothesis import given, strategies as st, settings, HealthCheck, assume

from app.factories.servusspeed_factory import ServusSpeedFactory
from app.models import Address
from app.models.base import VoucherKind
from app.models.providers.responses.servusspeed_response import ServusSpeedResponse


# --- Pytest Fixtures ---


@pytest.fixture
def valid_address_data() -> Dict[str, Any]:
    return {
        "street": "Musterstraße",
        "house_number": "123B",
        "city": "Berlin",
        "plz": "10115",
        "country_code": "DE",
    }


@pytest.fixture
def valid_address(valid_address_data: Dict[str, Any]) -> Address:
    return Address(**valid_address_data)


# Sample data from the prompt
SAMPLE_REAL_WORLD_PAYLOADS = [
    {
        "servusSpeedProduct": {
            "providerName": "Servus Premium 200",
            "productInfo": {
                "speed": 200,
                "contractDurationInMonths": 24,
                "connectionType": "Fiber",
                "tv": "ServusFlix Premium",
                "limitFrom": 150,
                "maxAge": 31,
            },
            "pricingDetails": {"monthlyCostInCent": 3774, "installationService": False},
            "discount": 12094,
        }
    },
    {  # Duplicate of first, good for checking consistency
        "servusSpeedProduct": {
            "providerName": "Servus Premium 200",
            "productInfo": {
                "speed": 200,
                "contractDurationInMonths": 24,
                "connectionType": "Fiber",
                "tv": "ServusFlix Premium",
                "limitFrom": 150,
                "maxAge": 31,
            },
            "pricingDetails": {"monthlyCostInCent": 3774, "installationService": False},
            "discount": 12094,
        }
    },
    {
        "servusSpeedProduct": {
            "providerName": "Servus Basic 50",
            "productInfo": {
                "speed": 50,
                "contractDurationInMonths": 12,
                "connectionType": "DSL",
                "tv": "ServusTV Standard",
                "limitFrom": 100,
                "maxAge": 31,
            },
            "pricingDetails": {"monthlyCostInCent": 2931, "installationService": False},
            "discount": 703,
        }
    },
    {
        "servusSpeedProduct": {
            "providerName": "Servus Plus 125",
            "productInfo": {
                "speed": 125,
                "contractDurationInMonths": 12,
                "connectionType": "Cable",
                "tv": "ServusTV Plus",
                "limitFrom": 100,
                "maxAge": 31,
            },
            "pricingDetails": {"monthlyCostInCent": 3731, "installationService": False},
            "discount": 895,
        }
    },
    {
        "servusSpeedProduct": {
            "providerName": "Servus Basic 100",
            "productInfo": {
                "speed": 100,
                "contractDurationInMonths": 12,
                "connectionType": "DSL",
                "tv": "ServusTV Standard",
                "limitFrom": 100,
                "maxAge": 31,
            },
            "pricingDetails": {"monthlyCostInCent": 3331, "installationService": False},
            "discount": 799,
        }
    },
    {
        "servusSpeedProduct": {
            "providerName": "Servus Ultra 225",
            "productInfo": {
                "speed": 225,
                "contractDurationInMonths": 24,
                "connectionType": "Fiber",
                "tv": "ServusFlix Pro",
                "limitFrom": 150,
                "maxAge": 31,
            },
            "pricingDetails": {"monthlyCostInCent": 4931, "installationService": False},
            "discount": 2366,
        }
    },
    {
        "servusSpeedProduct": {
            "providerName": "Servus Premium 150",
            "productInfo": {
                "speed": 150,
                "contractDurationInMonths": 24,
                "connectionType": "Fiber",
                "tv": "ServusFlix Premium",
                "limitFrom": 150,
                "maxAge": 31,
            },
            "pricingDetails": {"monthlyCostInCent": 4131, "installationService": False},
            "discount": 1982,
        }
    },
    {  # Different monthly cost and discount for same nominal product
        "servusSpeedProduct": {
            "providerName": "Servus Premium 200",
            "productInfo": {
                "speed": 200,
                "contractDurationInMonths": 24,
                "connectionType": "Fiber",
                "tv": "ServusFlix Premium",
                "limitFrom": 150,
                "maxAge": 31,
            },
            "pricingDetails": {"monthlyCostInCent": 4531, "installationService": False},
            "discount": 2174,
        }
    },
    {
        "servusSpeedProduct": {
            "providerName": "Servus Extreme 300",
            "productInfo": {
                "speed": 300,
                "contractDurationInMonths": 36,
                "connectionType": "Fiber",
                "tv": "ServusFlix Pro Max Ultra",
                "limitFrom": 200,
                "maxAge": 31,
            },
            "pricingDetails": {"monthlyCostInCent": 5431, "installationService": False},
            "discount": 3910,
        }
    },
    {
        "servusSpeedProduct": {
            "providerName": "Servus Extreme 400",
            "productInfo": {
                "speed": 400,
                "contractDurationInMonths": 36,
                "connectionType": "Fiber",
                "tv": "ServusFlix Pro Max Ultra",
                "limitFrom": 200,
                "maxAge": 31,
            },
            "pricingDetails": {"monthlyCostInCent": 6031, "installationService": False},
            "discount": 4342,
        }
    },
]


# --- Test Classes and Functions ---
class TestBuildAvailableProductsBody:
    def test_build_body_with_valid_address(self, valid_address: Address):
        body = ServusSpeedFactory.build_available_products_body(valid_address)
        assert isinstance(body, dict)
        assert "address" in body
        addr_part = body["address"]
        assert addr_part["strasse"] == valid_address.street
        assert addr_part["hausnummer"] == valid_address.house_number
        assert addr_part["postleitzahl"] == valid_address.plz
        assert addr_part["stadt"] == valid_address.city
        assert addr_part["land"] == valid_address.country_code


class TestParseDetailResponseHappyPath:
    @pytest.mark.parametrize("payload_data", SAMPLE_REAL_WORLD_PAYLOADS)
    def test_parse_with_real_world_examples(self, payload_data: Dict[str, Any]):
        pid = "real_world_pid_" + payload_data["servusSpeedProduct"][
            "providerName"
        ].replace(" ", "_")
        response = ServusSpeedFactory.parse_detail_response(pid, payload_data)
        assert response is not None, f"Parsing failed for payload: {payload_data}"
        ssp, info, price = (
            payload_data["servusSpeedProduct"],
            payload_data["servusSpeedProduct"]["productInfo"],
            payload_data["servusSpeedProduct"]["pricingDetails"],
        )
        assert response.product_id == pid
        assert response.provider_name == ssp["providerName"]
        assert response.speed_down_mbit == info["speed"]
        assert response.contract_duration_months == info["contractDurationInMonths"]
        assert response.connection_type == info["connectionType"]
        assert response.price_cents_month == price["monthlyCostInCent"]
        tv_val = info.get("tv")
        expected_tv_pkg_name = (
            tv_val.strip() if isinstance(tv_val, str) and tv_val.strip() else None
        )
        assert response.tv_included == bool(expected_tv_pkg_name)
        assert response.tv_package_name == expected_tv_pkg_name
        assert response.data_cap_gb == info.get("limitFrom")
        assert response.max_age == info.get("maxAge")
        assert response.installation_service_included == price.get(
            "installationService", False
        )
        discount = ssp.get("discount", 0)
        assert response.voucher_type == (VoucherKind.ABSOLUTE if discount else None)
        assert response.voucher_value_cents == (discount if discount else None)

    def test_parse_valid_payload_all_optional_fields_present(self):
        pid, payload = "test_pid_full", {
            "servusSpeedProduct": {
                "providerName": "TestNet",
                "productInfo": {
                    "speed": 100,
                    "contractDurationInMonths": 12,
                    "connectionType": "DSL",
                    "tv": "Full TV Package",
                    "limitFrom": 500,
                    "maxAge": 27,
                },
                "pricingDetails": {
                    "monthlyCostInCent": 2500,
                    "installationService": True,
                },
                "discount": 5000,
            }
        }
        response = ServusSpeedFactory.parse_detail_response(pid, payload)
        assert response is not None
        assert response.provider_name == "TestNet"
        assert response.speed_down_mbit == 100
        assert response.tv_included is True
        assert response.tv_package_name == "Full TV Package"
        assert response.data_cap_gb == 500
        assert response.max_age == 27
        assert response.installation_service_included is True
        assert response.voucher_type == VoucherKind.ABSOLUTE
        assert response.voucher_value_cents == 5000

    def test_parse_valid_payload_minimal_fields_optional_absent(self):
        pid, payload = "test_pid_minimal", {
            "servusSpeedProduct": {
                "providerName": "MiniNet",
                "productInfo": {
                    "speed": 50,
                    "contractDurationInMonths": 24,
                    "connectionType": "Cable",
                },
                "pricingDetails": {"monthlyCostInCent": 2000},
            }
        }
        response = ServusSpeedFactory.parse_detail_response(pid, payload)
        assert response is not None
        assert response.provider_name == "MiniNet"
        assert response.data_cap_gb is None
        assert response.tv_included is False
        assert response.tv_package_name is None
        assert response.max_age is None
        assert response.installation_service_included is False
        assert response.voucher_type is None
        assert response.voucher_value_cents is None

    @pytest.mark.parametrize(
        "input_val, expected_bool",
        [
            (True, True),
            (False, False),
            ("yes", True),
            ("YES", True),
            (" yeS ", True),
            ("true", True),
            ("TRUE", True),
            (" trUe ", True),
            ("included", True),
            ("INCLUDED", True),
            (" inCluDed ", True),
            ("no", False),
            ("any_other_string", False),
            ("", False),
            (1, False),
            (0, False),
            (None, False),
        ],
    )
    def test_parse_installation_service_variations(self, input_val, expected_bool):
        pid, payload = "pid_install_test", {
            "servusSpeedProduct": {
                "providerName": "InstallNet",
                "productInfo": {
                    "speed": 10,
                    "contractDurationInMonths": 1,
                    "connectionType": "Fiber",
                },
                "pricingDetails": {
                    "monthlyCostInCent": 100,
                    "installationService": input_val,
                },
            }
        }
        response = ServusSpeedFactory.parse_detail_response(pid, payload)
        assert response is not None
        assert response.installation_service_included == expected_bool

    @pytest.mark.parametrize(
        "tv_input, expected_included, expected_package_name",
        [
            ("Premium TV", True, "Premium TV"),
            ("  ServusFlix Basic  ", True, "ServusFlix Basic"),
            ("", False, None),
            ("   ", False, None),
            (None, False, None),
            (123, False, None),
            (True, False, None),
        ],
    )
    def test_parse_tv_value_variations(
        self, tv_input, expected_included, expected_package_name
    ):
        pid, payload = "pid_tv_test", {
            "servusSpeedProduct": {
                "providerName": "TVNet",
                "productInfo": {
                    "speed": 10,
                    "contractDurationInMonths": 1,
                    "connectionType": "DSL",
                    "tv": tv_input,
                },
                "pricingDetails": {"monthlyCostInCent": 100},
            }
        }
        response = ServusSpeedFactory.parse_detail_response(pid, payload)
        assert response is not None
        assert response.tv_included == expected_included
        assert response.tv_package_name == expected_package_name

    @pytest.mark.parametrize(
        "discount_input, expected_value, expected_type",
        [
            (500, 500, VoucherKind.ABSOLUTE),
            (0, None, None),
            ("1000", 1000, VoucherKind.ABSOLUTE),
            ("0", None, None),
            (None, None, None),
            ("abc", None, None),
            (-100, 100, VoucherKind.ABSOLUTE),
        ],
    )
    def test_parse_discount_variations(
        self, discount_input, expected_value, expected_type
    ):
        pid = "pid_discount_test"
        payload = {
            "servusSpeedProduct": {
                "providerName": "DiscountNet",
                "productInfo": {
                    "speed": 10,
                    "contractDurationInMonths": 1,
                    "connectionType": "Fiber",
                },
                "pricingDetails": {"monthlyCostInCent": 100},
            }
        }
        if discount_input is not None:
            payload["servusSpeedProduct"]["discount"] = discount_input
        response = ServusSpeedFactory.parse_detail_response(pid, payload)
        assert response is not None
        assert response.voucher_value_cents == expected_value
        assert response.voucher_type == expected_type

    @pytest.mark.parametrize(
        "field_name, value",
        [
            ("limitFrom", "not-a-number"),
            ("limitFrom", None),
            ("maxAge", "twenty"),
            ("maxAge", None),
            ("limitFrom", [1, 2, 3]),
            ("maxAge", {"age": 10}),
        ],
    )
    def test_parse_optional_numeric_fields_malformed_become_none(
        self, field_name, value
    ):
        pid = f"pid_{field_name}_malformed"
        payload = {
            "servusSpeedProduct": {
                "providerName": "MalformedNet",
                "productInfo": {
                    "speed": 10,
                    "contractDurationInMonths": 1,
                    "connectionType": "Fiber",
                    field_name: value,
                },
                "pricingDetails": {"monthlyCostInCent": 100},
            }
        }
        response = ServusSpeedFactory.parse_detail_response(pid, payload)
        # Response object should always be created and the malformed numeric field becomes None
        assert response is not None
        if field_name == "limitFrom":
            assert response.data_cap_gb is None
        elif field_name == "maxAge":
            assert response.max_age is None


class TestParseDetailResponseEdgeCasesAndFailures:
    @pytest.mark.parametrize("bad_payload", [None, [], "string", 123])
    def test_parse_invalid_payload_type_returns_none(self, bad_payload):
        response = ServusSpeedFactory.parse_detail_response(
            "pid_invalid_payload", bad_payload
        )
        assert response is None

    def test_parse_empty_dict_payload_returns_none(self):
        response = ServusSpeedFactory.parse_detail_response("pid_empty_dict", {})
        assert response is None

    @pytest.mark.parametrize(
        "key_to_make_invalid, structure_to_invalidate",
        [
            ("servusSpeedProduct", "payload"),
            ("productInfo", "servusSpeedProduct"),
            ("pricingDetails", "servusSpeedProduct"),
        ],
    )
    def test_parse_missing_or_invalid_nested_structures_returns_none(
        self, key_to_make_invalid, structure_to_invalidate
    ):
        pid = "pid_missing_struct"
        payload = {
            "servusSpeedProduct": {
                "providerName": "ValidProvider",
                "productInfo": {
                    "speed": 100,
                    "contractDurationInMonths": 12,
                    "connectionType": "DSL",
                },
                "pricingDetails": {"monthlyCostInCent": 2000},
            }
        }
        if structure_to_invalidate == "payload":
            payload[key_to_make_invalid] = "not_a_dict"
        elif structure_to_invalidate == "servusSpeedProduct":
            payload["servusSpeedProduct"][key_to_make_invalid] = "not_a_dict"
        response = ServusSpeedFactory.parse_detail_response(pid, payload)
        assert response is None

    @pytest.mark.parametrize(
        "field_to_remove, structure_path",
        [
            ("providerName", "servusSpeedProduct"),
            ("speed", "productInfo"),
            ("contractDurationInMonths", "productInfo"),
            ("connectionType", "productInfo"),
            ("monthlyCostInCent", "pricingDetails"),
        ],
    )
    def test_parse_missing_required_fields_returns_none(
        self, field_to_remove: str, structure_path: str
    ):
        pid = f"pid_missing_{field_to_remove}"
        payload = {
            "servusSpeedProduct": {
                "providerName": "TestNet",
                "productInfo": {
                    "speed": 100,
                    "contractDurationInMonths": 12,
                    "connectionType": "DSL",
                },
                "pricingDetails": {"monthlyCostInCent": 2000},
            }
        }
        if structure_path == "servusSpeedProduct":
            del payload["servusSpeedProduct"][field_to_remove]
        elif structure_path == "productInfo":
            del payload["servusSpeedProduct"]["productInfo"][field_to_remove]
        elif structure_path == "pricingDetails":
            del payload["servusSpeedProduct"]["pricingDetails"][field_to_remove]
        response = ServusSpeedFactory.parse_detail_response(pid, payload)
        assert response is None

    @pytest.mark.parametrize(
        "field_to_mangle, mangled_value, structure_path",
        [
            ("providerName", 123, "servusSpeedProduct"),
            ("connectionType", True, "productInfo"),
            ("speed", "fast", "productInfo"),
            ("monthlyCostInCent", [1, 2], "pricingDetails"),
        ],
    )
    def test_parse_incorrect_type_for_fields_returns_none(
        self, field_to_mangle, mangled_value, structure_path
    ):
        pid = f"pid_mangle_{field_to_mangle}"
        payload = {
            "servusSpeedProduct": {
                "providerName": "TestNet",
                "productInfo": {
                    "speed": 100,
                    "contractDurationInMonths": 12,
                    "connectionType": "DSL",
                },
                "pricingDetails": {"monthlyCostInCent": 2000},
            }
        }
        if structure_path == "servusSpeedProduct":
            payload["servusSpeedProduct"][field_to_mangle] = mangled_value
        elif structure_path == "productInfo":
            payload["servusSpeedProduct"]["productInfo"][
                field_to_mangle
            ] = mangled_value
        elif structure_path == "pricingDetails":
            payload["servusSpeedProduct"]["pricingDetails"][
                field_to_mangle
            ] = mangled_value
        response = ServusSpeedFactory.parse_detail_response(pid, payload)
        assert response is None

    def test_parse_with_extra_fields_is_successful(self):
        pid = "pid_extra_fields"
        payload = {
            "servusSpeedProduct": {
                "providerName": "ExtraNet",
                "productInfo": {
                    "speed": 100,
                    "contractDurationInMonths": 12,
                    "connectionType": "DSL",
                    "extraInfoField": "val",
                },
                "pricingDetails": {
                    "monthlyCostInCent": 2000,
                    "extraPricingField": True,
                },
                "extraRootField": "another_val",
            },
            "topLevelExtraField": 12345,
        }
        response = ServusSpeedFactory.parse_detail_response(pid, payload)
        assert response is not None
        assert response.provider_name == "ExtraNet"


# --- Hypothesis Fuzz Testing ---
json_primitive = (
    st.none()
    | st.booleans()
    | st.floats(allow_nan=False, allow_infinity=False)
    | st.integers()
    | st.text(st.characters(blacklist_characters="{}"), max_size=30)
)  # Avoid {} in text
json_type_strategy = st.recursive(
    json_primitive,
    lambda children: st.lists(children, max_size=3)
    | st.dictionaries(
        st.text(st.characters(blacklist_characters="{}"), max_size=10),
        children,
        max_size=3,
    ),
)
product_info_strategy = st.dictionaries(
    keys=st.text(st.characters(blacklist_characters="{}"), max_size=25),
    values=json_type_strategy,
    min_size=0,
    max_size=10,
)
pricing_details_strategy = st.dictionaries(
    keys=st.text(st.characters(blacklist_characters="{}"), max_size=25),
    values=json_type_strategy,
    min_size=0,
    max_size=7,
)
servus_product_strategy = st.dictionaries(
    keys=st.text(st.characters(blacklist_characters="{}"), max_size=25),
    values=st.one_of(
        json_type_strategy, product_info_strategy, pricing_details_strategy
    ),
    min_size=0,
    max_size=8,
)
fuzz_payload_strategy = st.one_of(
    json_type_strategy,
    st.fixed_dictionaries(
        {"servusSpeedProduct": st.one_of(json_type_strategy, servus_product_strategy)}
    ),
)

# Strategy for values that might go into to_int, avoiding problematic characters for logging if not escaped
# Since we added escaping in the factory, we can be more liberal again, but blacklist is safer.
to_int_value_strategy = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(),
    st.floats(allow_nan=False, allow_infinity=False),
    st.text(st.characters(blacklist_characters="{}"), max_size=10),
    st.lists(st.integers(), max_size=2),
    st.dictionaries(
        st.text(st.characters(blacklist_characters="{}"), max_size=2),
        st.integers(),
        max_size=2,
    ),
)


class TestParseDetailResponseFuzzing:
    @given(
        payload=fuzz_payload_strategy,
        pid=st.text(st.characters(blacklist_characters="{}"), max_size=20),
    )
    @settings(
        max_examples=300,
        deadline=1500,
        suppress_health_check=[
            HealthCheck.too_slow,
            HealthCheck.data_too_large,
            HealthCheck.filter_too_much,
        ],
    )
    def test_fuzz_parse_detail_response_does_not_crash(self, payload: Any, pid: str):
        try:
            result = ServusSpeedFactory.parse_detail_response(str(pid), payload)
            assert result is None or isinstance(result, ServusSpeedResponse)
        except Exception as e:
            pytest.fail(
                f"Unhandled exception in parse_detail_response with payload {payload} and pid {pid}: {e}"
            )

    @given(value=to_int_value_strategy)
    @settings(
        max_examples=100,
        deadline=500,
        suppress_health_check=[HealthCheck.filter_too_much],
    )
    def test_fuzz_to_int_via_parser_mandatory_field(self, value):
        # Skip infinite inputs
        try:
            f_val = float(value)
            assume(math.isfinite(f_val))
        except (ValueError, TypeError):
            # non-float-convertible inputs are fine
            pass
        pid = "fuzz_to_int_mandatory"
        payload = {
            "servusSpeedProduct": {
                "providerName": "FuzzNetMandatory",
                "productInfo": {
                    "speed": value,
                    "contractDurationInMonths": 24,
                    "connectionType": "DSL",
                },
                "pricingDetails": {"monthlyCostInCent": 3000},
            }
        }
        try:
            result = ServusSpeedFactory.parse_detail_response(pid, payload)
            can_be_int = False
            expected_int_val = 0
            if value is not None:
                try:
                    val_float = float(value)
                    expected_int_val = round(val_float)
                    can_be_int = True
                except (ValueError, TypeError):
                    pass
            if can_be_int and expected_int_val > 0:
                assert isinstance(result, ServusSpeedResponse)
                assert result.speed_down_mbit == expected_int_val
            else:
                assert result is None
        except Exception as e:
            pytest.fail(
                f"Unhandled exception in to_int (via speed) with value {value}: {e}"
            )

    @given(value=to_int_value_strategy)
    @settings(
        max_examples=100,
        deadline=500,
        suppress_health_check=[HealthCheck.filter_too_much],
    )
    def test_fuzz_to_int_via_parser_optional_field(self, value):
        pid = "fuzz_to_int_optional"
        payload = {
            "servusSpeedProduct": {
                "providerName": "FuzzNetOptional",
                "productInfo": {
                    "speed": 100,
                    "contractDurationInMonths": 24,
                    "connectionType": "DSL",
                    "limitFrom": value,
                },
                "pricingDetails": {"monthlyCostInCent": 3000},
            }
        }
        try:
            result = ServusSpeedFactory.parse_detail_response(pid, payload)
            can_be_int = False
            expected_data_cap_gb = None
            if value is not None:
                try:
                    expected_data_cap_gb = int(value)
                    can_be_int = True
                except (ValueError, TypeError):
                    pass

            # data_cap_gb should be positive integer or None otherwise
            assert isinstance(result, ServusSpeedResponse)
            if can_be_int and expected_data_cap_gb > 0:
                assert result.data_cap_gb == expected_data_cap_gb
            else:
                assert result.data_cap_gb is None
        except Exception as e:
            pytest.fail(
                f"Unhandled exception in to_int (via limitFrom) with value {value}: {e}"
            )
