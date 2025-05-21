from __future__ import annotations

from typing import Any, Dict

import pytest
from hypothesis import (
    given,
    strategies as st,
    settings,
    HealthCheck,
)
from pydantic import ValidationError, FieldValidationInfo

from app.models.base.offer import VoucherKind, Offer

# --- Hypothesis Strategies
st_non_empty_text = st.text(
    min_size=1,
    max_size=50,
    alphabet=st.characters(
        min_codepoint=32, max_codepoint=126, blacklist_characters="{}"
    ),
)
st_optional_text = st.one_of(st.none(), st_non_empty_text)
MAX_INT_VALUE = 10**9
st_positive_int_val = st.integers(min_value=1, max_value=MAX_INT_VALUE)
st_optional_positive_int_val = st.one_of(st.none(), st_positive_int_val)
st_bool_val = st.booleans()
st_connection_type_values = st.sampled_from(["DSL", "Cable", "Fiber", "Mobile"])
st_voucher_kind_enum_values = st.sampled_from(list(VoucherKind))
st_optional_voucher_kind_values = st.one_of(st.none(), st_voucher_kind_enum_values)
st_voucher_value_percent_values = st.floats(
    min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False
)
st_optional_voucher_value_percent_values = st.one_of(
    st.none(), st_voucher_value_percent_values
)


@st.composite
def st_valid_offer_input_dict(draw: st.DrawFn) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {
        "provider": draw(st_non_empty_text),
        "plan_name": draw(st_non_empty_text),
        "product_id": draw(st_non_empty_text),
        "speed_down_mbit": draw(st_positive_int_val),
        "connection_type": draw(st_connection_type_values),
        "contract_duration_months": draw(st_positive_int_val),
        "data_cap_gb": draw(st_optional_positive_int_val),
        "contract_regular_months": draw(st_optional_positive_int_val),
        "installation_service_included": draw(st_bool_val),
        "tv_included": draw(st.one_of(st.none(), st_bool_val)),
        "tv_package_name": draw(st_optional_text),
        "max_age": draw(st_optional_positive_int_val),
        "voucher_min_order_value_cents": draw(st_optional_positive_int_val),
        "voucher_max_value_cents": draw(st_optional_positive_int_val),
        "voucher_max_runtime_months": draw(st_optional_positive_int_val),
        "voucher_value_cents": draw(st_optional_positive_int_val),
        "voucher_type": draw(st_optional_voucher_kind_values),
    }
    price_choice = draw(st.sampled_from(["intro_only", "regular_only", "both"]))
    if price_choice == "intro_only":
        kwargs["price_cents_month_intro"] = draw(st_positive_int_val)
    elif price_choice == "regular_only":
        kwargs["price_cents_month_regular"] = draw(st_positive_int_val)
    else:
        kwargs["price_cents_month_intro"] = draw(st_positive_int_val)
        kwargs["price_cents_month_regular"] = draw(st_positive_int_val)
    # Ensure that if contract_regular_months differs from contract_duration_months, both prices are provided
    if kwargs.get("contract_regular_months") is not None and kwargs["contract_regular_months"] != kwargs["contract_duration_months"]:
        if "price_cents_month_intro" not in kwargs:
            kwargs["price_cents_month_intro"] = draw(st_positive_int_val)
        if "price_cents_month_regular" not in kwargs:
            kwargs["price_cents_month_regular"] = draw(st_positive_int_val)
    voucher_value_percent_val = draw(st_optional_voucher_value_percent_values)
    kwargs["voucher_value_percent"] = voucher_value_percent_val
    return kwargs


hypothesis_test_settings = settings(
    deadline=None,
    suppress_health_check=[
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
        HealthCheck.filter_too_much,
    ],
    max_examples=100,
)


class TestOfferModel:
    @pytest.fixture(scope="class")
    def min_valid_offer_data(self) -> Dict[str, Any]:
        return {
            "provider": "TestProvider",
            "plan_name": "TestPlan",
            "product_id": "TP-001",
            "speed_down_mbit": 100,
            "connection_type": "DSL",
            "contract_duration_months": 12,
            "price_cents_month_regular": 2000,
            "tv_included": False,
        }

    @pytest.mark.parametrize(
        "field_name, invalid_value, expected_outcome",
        [
            (
                "speed_down_mbit",
                0,
                {
                    "error_type": "int_type",
                    "error_loc": ("speed_down_mbit",),
                    "msg_part": "Input should be a valid integer",
                },
            ),
            (
                "speed_down_mbit",
                "abc",
                {
                    "error_type": "int_parsing",
                    "error_loc": ("speed_down_mbit",),
                    "msg_part": "Input should be a valid integer",
                },
            ),
            ("voucher_value_percent", -0.1, {"final_value": None}),
            (
                "voucher_value_percent",
                100.1,
                {
                    "error_type": "less_than_equal",
                    "error_loc": ("voucher_value_percent",),
                    "msg_part": "Input should be less than or equal to 100",
                },
            ),
            ("data_cap_gb", 0, {"final_value": None}),
        ],
    )
    def test_invalid_inputs_with_before_validators(
        self,
        field_name: str,
        invalid_value: Any,
        expected_outcome: dict,
        min_valid_offer_data: Dict[str, Any],
    ):
        data = {**min_valid_offer_data, field_name: invalid_value}
        if field_name in ["price_cents_month_intro", "price_cents_month_regular"] and (
            not isinstance(invalid_value, int)
            or (isinstance(invalid_value, int) and invalid_value <= 0)
        ):
            if (
                data.get("price_cents_month_intro") is None
                and data.get("price_cents_month_regular") is None
            ):
                data["price_cents_month_regular"] = 2000
        elif (
            data.get("price_cents_month_intro") is None
            and data.get("price_cents_month_regular") is None
        ):
            data["price_cents_month_regular"] = 2000

        if "error_type" in expected_outcome:
            with pytest.raises(ValidationError) as exc_info:
                Offer(**data)
            found_error = False
            for e in exc_info.value.errors(include_input=False):
                if (
                    e["loc"] == expected_outcome["error_loc"]
                    and e["type"] == expected_outcome["error_type"]
                ):
                    if "msg_part" in expected_outcome:
                        assert expected_outcome["msg_part"] in e["msg"]
                    found_error = True
                    break
            assert (
                found_error
            ), f"Expected error {expected_outcome} not found. Actual: {exc_info.value.errors(include_input=False)}"
        else:
            offer = Offer(**data)
            assert getattr(offer, field_name) == expected_outcome["final_value"]

    @hypothesis_test_settings
    @given(data=st_valid_offer_input_dict())
    def test_valid_offer_instantiation_and_defaults(self, data: Dict[str, Any]):
        # Capture initial input for tv_included if provided, otherwise it's "omitted"
        initial_tv_included_input = data.get("tv_included")
        initial_tv_package_name_input = data.get("tv_package_name")

        try:
            offer = Offer(**data)
        except ValidationError as e:
            pytest.fail(
                f"Valid data failed validation: {e.errors(include_input=False)}\nInput Data: {data}"
            )

        # Determine expected tv_included based on your new logic
        # The initial `tv_included` value (from input or default=False) matters for the OR condition
        tv_included_before_model_validator: bool
        if initial_tv_included_input is None:  # Omitted from input
            tv_included_before_model_validator = Offer.model_fields[
                "tv_included"
            ].get_default()  # Should be False
        else:  # Explicitly provided
            tv_included_before_model_validator = initial_tv_included_input

        expected_tv_included: bool = bool(
            initial_tv_package_name_input or tv_included_before_model_validator
        )

        assert offer.tv_included == expected_tv_included, (
            f"TV included mismatch. \n"
            f"Input tv_package_name: {initial_tv_package_name_input}, \n"
            f"Input tv_included: {initial_tv_included_input} (became {tv_included_before_model_validator} before model validator), \n"
            f"Got offer.tv_included: {offer.tv_included}, Expected: {expected_tv_included}"
        )

        if data.get("voucher_value_percent") is not None:
            assert offer.voucher_type == VoucherKind.PERCENTAGE
        else:
            assert offer.voucher_type == data.get("voucher_type")

        assert offer.contract_regular_months == data.get("contract_regular_months", 12)
        assert offer.installation_service_included == data.get(
            "installation_service_included", False
        )

    @pytest.mark.parametrize(
        "field_name",
        [
            "provider",
            "plan_name",
            "product_id",
            "speed_down_mbit",
            "connection_type",
            "contract_duration_months",
        ],
    )
    def test_missing_required_fields(
        self, field_name: str, min_valid_offer_data: Dict[str, Any]
    ):
        data = min_valid_offer_data.copy()
        if field_name not in ["price_cents_month_intro", "price_cents_month_regular"]:
            if (
                data.get("price_cents_month_intro") is None
                and data.get("price_cents_month_regular") is None
            ):
                data["price_cents_month_regular"] = 2000
        del data[field_name]
        with pytest.raises(ValidationError) as exc_info:
            Offer(**data)
        assert any(
            e["type"] == "missing" and e["loc"] == (field_name,)
            for e in exc_info.value.errors(include_input=False)
        ), f"Missing error for '{field_name}'. Errors: {exc_info.value.errors(include_input=False)}"

    def test_tv_included_derivation_detailed(
        self, min_valid_offer_data: Dict[str, Any]
    ):
        # Logic: tv_included_final = tv_package_name OR tv_included_initial_value
        # where tv_included_initial_value is (input tv_included if provided, else default False)

        # Case 1: tv_package_name set, tv_included omitted (initial=False from default)
        # Final = True (from tv_package_name) OR False => True
        data1 = {**min_valid_offer_data, "tv_package_name": "Premium TV"}
        if "tv_included" in data1:
            del data1["tv_included"]
        offer1 = Offer(**data1)
        assert offer1.tv_included is True, "Case 1"

        # Case 2: tv_package_name set with explicit None tv_included yields True
        data2 = {
            **min_valid_offer_data,
            "tv_package_name": "Premium TV",
            "tv_included": None,
        }
        offer2 = Offer(**data2)
        assert offer2.tv_included is True, "Case 2"

        # Case 3: tv_package_name set, tv_included explicitly False (initial=False)
        # Final = True (from tv_package_name) OR False => True
        data3 = {
            **min_valid_offer_data,
            "tv_package_name": "Premium TV",
            "tv_included": False,
        }
        offer3 = Offer(**data3)
        assert offer3.tv_included is True, "Case 3"

        # Case 4: tv_package_name None, tv_included omitted (initial=False from default)
        # Final = False (from tv_package_name) OR False => False
        data4 = {**min_valid_offer_data, "tv_package_name": None}
        if "tv_included" in data4:
            del data4["tv_included"]
        offer4 = Offer(**data4)
        assert offer4.tv_included is False, "Case 4"

        # Case 5: tv_package_name None, tv_included explicitly None (initial=None)
        # Final = False (from tv_package_name) OR None => False
        data5 = {**min_valid_offer_data, "tv_package_name": None, "tv_included": None}
        offer5 = Offer(**data5)
        assert offer5.tv_included is False, "Case 5"

        # Case 6: tv_package_name None, tv_included explicitly True (initial=True)
        # Final = False (from tv_package_name) OR True => True
        data6 = {**min_valid_offer_data, "tv_package_name": None, "tv_included": True}
        offer6 = Offer(**data6)
        assert offer6.tv_included is True, "Case 6"

        # Case 7: tv_package_name is empty string, tv_included omitted (initial=False from default)
        # Empty string is falsy.
        # Final = False (from tv_package_name) OR False => False
        data7 = {**min_valid_offer_data, "tv_package_name": ""}
        if "tv_included" in data7:
            del data7["tv_included"]
        offer7 = Offer(**data7)
        assert offer7.tv_included is False, "Case 7"

        # Case 8: tv_package_name is empty string, tv_included is True (initial=True)
        # Final = False (from tv_package_name) OR True => True
        data8 = {**min_valid_offer_data, "tv_package_name": "", "tv_included": True}
        offer8 = Offer(**data8)
        assert offer8.tv_included is True, "Case 8"
