from __future__ import annotations

from typing import Dict, Tuple, List, Any, Set

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck, assume, Phase
from pydantic import (
    ValidationError,
)

from app.models.base.offer import VoucherKind, Offer
from app.utils.merge import _key, _effective_price, merge_offers

# --- Hypothesis Strategies ---
id_text_strategy = st.text(
    alphabet=st.characters(
        min_codepoint=65, max_codepoint=122, categories=("Lu", "Ll", "Nd")
    ),
    min_size=1,
    max_size=20,
)
general_text_strategy = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126), min_size=0, max_size=50
)
MAX_PRICE_CENTS = 200_000_00
optional_positive_int_price_strategy = st.one_of(
    st.none(), st.integers(min_value=1, max_value=MAX_PRICE_CENTS)
)
required_positive_int_price_strategy = st.integers(
    min_value=1, max_value=MAX_PRICE_CENTS
)
optional_positive_int_generic_strategy = st.one_of(
    st.none(), st.integers(min_value=1, max_value=1000)
)
required_positive_int_generic_strategy = st.integers(min_value=1, max_value=1000)
optional_non_negative_float_strategy = st.one_of(
    st.none(),
    st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False),
)
voucher_kind_strategy = st.one_of(st.none(), st.sampled_from(list(VoucherKind)))
connection_type_input_strategy = st.sampled_from(
    [
        "DSL",
        "Cable",
        "Fiber",
        "Mobile",
        "dsl",
        "CABLE",
        "fibre",
        "fibEr",
        "UnknownTech",
    ]  # Includes values for normalization and invalid ones
)


@st.composite
def offer_constructor_args_strategy(draw: st.DrawFn) -> Dict[str, Any]:
    args: Dict[str, Any] = {
        "provider": draw(id_text_strategy),
        "plan_name": draw(general_text_strategy),
        "product_id": draw(id_text_strategy),
        "speed_down_mbit": draw(required_positive_int_generic_strategy),
        "data_cap_gb": draw(optional_positive_int_generic_strategy),
        "connection_type": draw(connection_type_input_strategy),
        "contract_duration_months": draw(required_positive_int_generic_strategy),
        "contract_regular_months": draw(
            st.one_of(st.none(), required_positive_int_generic_strategy)
        ),
        "installation_service_included": draw(st.booleans()),
        "tv_package_name": draw(st.one_of(st.none(), general_text_strategy)),
        "tv_included": draw(st.one_of(st.none(), st.booleans())),
        "max_age": draw(optional_positive_int_generic_strategy),
    }
    args["voucher_value_percent"] = draw(optional_non_negative_float_strategy)
    if args["voucher_value_percent"] is not None:
        args["voucher_type"] = draw(
            st.one_of(
                st.none(),
                st.sampled_from(
                    [vk for vk in VoucherKind if vk != VoucherKind.PERCENTAGE]
                ),
            )
        )
    else:
        args["voucher_type"] = draw(voucher_kind_strategy)
    args["voucher_value_cents"] = draw(optional_positive_int_generic_strategy)
    args["voucher_min_order_value_cents"] = draw(optional_positive_int_generic_strategy)
    args["voucher_max_value_cents"] = draw(optional_positive_int_generic_strategy)
    args["voucher_max_runtime_months"] = draw(optional_positive_int_generic_strategy)
    price_intro = draw(optional_positive_int_price_strategy)
    price_regular = draw(optional_positive_int_price_strategy)
    if price_intro is None and price_regular is None:
        if draw(st.booleans()):
            args["price_cents_month_intro"] = draw(required_positive_int_price_strategy)
            args["price_cents_month_regular"] = None
        else:
            args["price_cents_month_intro"] = None
            args["price_cents_month_regular"] = draw(
                required_positive_int_price_strategy
            )
    else:
        args["price_cents_month_intro"] = price_intro
        args["price_cents_month_regular"] = price_regular
    return args


# Strategy to generate valid Offer instances, filtering out those that would fail model validation
# due to connection_type before they even get to merge_offers
@st.composite
def valid_offer_strategy(draw: st.DrawFn) -> Offer:
    """Generates Offer instances that are guaranteed to pass Pydantic validation."""
    while True:
        args = draw(offer_constructor_args_strategy())
        try:
            offer = Offer.model_validate(args)
            return offer
        except ValidationError as e:
            # This is expected for inputs like "UnknownTech" for connection_type.
            # Hypothesis will retry with different inputs from offer_constructor_args_strategy.
            # We use 'assume(False)' to tell Hypothesis this example is invalid for this specific strategy
            # and it should try generating a new one.
            assume(False)


offers_list_strategy: st.SearchStrategy[List[Offer]] = st.lists(
    valid_offer_strategy(), min_size=0, max_size=30
)

# --- Tests for Helper Functions ---


@given(
    offer=valid_offer_strategy()
)  # Use valid_offer_strategy to ensure Offer instance is valid
@settings(
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
    deadline=None,
)
def test_key_generation(offer: Offer) -> None:
    key_provider, key_product_id = _key(offer)
    assert key_provider == offer.provider.lower()
    assert key_product_id == offer.product_id.lower()
    assert isinstance(key_provider, str)
    assert isinstance(key_product_id, str)


@given(data=st.data())
@settings(
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
    deadline=None,
)
def test_effective_price_logic(data: st.DataObject) -> None:
    # Base args that will always create a valid Offer, connection_type fixed
    base_args = {
        "provider": "P",
        "product_id": "1",
        "plan_name": "N",
        "speed_down_mbit": 100,
        "connection_type": "DSL",
        "contract_duration_months": 12,
    }

    # Case 1: Intro price is set
    args_intro_set = base_args.copy()
    intro_val = data.draw(required_positive_int_price_strategy)
    args_intro_set["price_cents_month_intro"] = intro_val
    args_intro_set["price_cents_month_regular"] = data.draw(
        optional_positive_int_price_strategy
    )
    offer_intro_set = Offer.model_validate(args_intro_set)
    assert _effective_price(offer_intro_set) == intro_val

    # Case 2: Intro price is None, regular price is set
    args_regular_only = base_args.copy()
    regular_val = data.draw(required_positive_int_price_strategy)
    args_regular_only["price_cents_month_intro"] = None
    args_regular_only["price_cents_month_regular"] = regular_val
    offer_regular_only = Offer.model_validate(args_regular_only)
    assert _effective_price(offer_regular_only) == regular_val


# --- Tests for merge_offers ---


@given(raw_offers=offers_list_strategy)  # uses valid_offer_strategy for elements
@settings(
    suppress_health_check=[
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
        HealthCheck.filter_too_much,
    ],
    deadline=None,
    phases=[Phase.generate, Phase.shrink, Phase.target],
)
def test_merge_offers_properties(raw_offers: List[Offer]) -> None:
    merged_offers = merge_offers(raw_offers)
    assert len(merged_offers) <= len(raw_offers)
    seen_keys_in_merged: Set[Tuple[str, str]] = set()
    for offer in merged_offers:
        key = _key(offer)
        assert key not in seen_keys_in_merged
        seen_keys_in_merged.add(key)
    if len(merged_offers) > 1:
        for i in range(len(merged_offers) - 1):
            price_current = _effective_price(merged_offers[i])
            price_next = _effective_price(merged_offers[i + 1])
            assert price_current <= price_next
    raw_offers_grouped_by_key: Dict[Tuple[str, str], List[Offer]] = {}
    for offer in raw_offers:
        key = _key(offer)
        raw_offers_grouped_by_key.setdefault(key, []).append(offer)
    for key, group_of_offers_for_key in raw_offers_grouped_by_key.items():
        if not group_of_offers_for_key:
            continue  # Should not happen with current strategy
        expected_min_price_for_group = min(
            _effective_price(o) for o in group_of_offers_for_key
        )
        merged_offer_for_key_list = [o for o in merged_offers if _key(o) == key]
        assert len(merged_offer_for_key_list) == 1
        merged_offer_for_key = merged_offer_for_key_list[0]
        assert _effective_price(merged_offer_for_key) == expected_min_price_for_group


def test_merge_offers_empty_list() -> None:
    assert merge_offers([]) == []


def test_merge_offers_single_offer() -> None:
    offer_data = {
        "provider": "TestProvider",
        "product_id": "Prod1",
        "plan_name": "Plan A",
        "speed_down_mbit": 100,
        "connection_type": "Fiber",
        "price_cents_month_intro": 2000,
        "contract_duration_months": 12,
    }
    single_offer = Offer.model_validate(offer_data)
    assert merge_offers([single_offer]) == [single_offer]


def test_merge_offers_deduplication_and_sorting_specific_case() -> None:
    o1 = Offer.model_validate(
        {
            "provider": "ProviderOne",
            "product_id": "Alpha",
            "plan_name": "Basic",
            "speed_down_mbit": 50,
            "connection_type": "DSL",
            "price_cents_month_intro": 1000,
            "contract_duration_months": 24,
        }
    )
    o2 = Offer.model_validate(
        {
            "provider": "providerone",
            "product_id": "alpha",
            "plan_name": "Basic Plus",
            "speed_down_mbit": 50,
            "connection_type": "DSL",
            "price_cents_month_intro": 1200,
            "contract_duration_months": 24,
        }
    )
    o3 = Offer.model_validate(
        {
            "provider": "ProviderOne",
            "product_id": "Beta",
            "plan_name": "Fast",
            "speed_down_mbit": 100,
            "connection_type": "Cable",
            "price_cents_month_regular": 1500,
            "contract_duration_months": 12,
        }
    )
    o4 = Offer.model_validate(
        {
            "provider": "ProviderTwo",
            "product_id": "Alpha",
            "plan_name": "Ultra",
            "speed_down_mbit": 200,
            "connection_type": "Fiber",
            "price_cents_month_intro": 800,
            "contract_duration_months": 12,
        }
    )
    o5 = Offer.model_validate(
        {
            "provider": "ProviderOne",
            "product_id": "Alpha",
            "plan_name": "Basic Alt",
            "speed_down_mbit": 50,
            "connection_type": "DSL",
            "price_cents_month_regular": 900,
            "contract_duration_months": 24,
        }
    )
    raw_offers = [o1, o2, o3, o4, o5]
    merged = merge_offers(raw_offers)
    assert len(merged) == 3
    assert merged[0] is o4
    assert merged[1] is o5
    assert merged[2] is o3
    assert _effective_price(merged[0]) == 800
    assert _effective_price(merged[1]) == 900
    assert _effective_price(merged[2]) == 1500


# --- Tests for Pydantic Model Validators ---


def test_offer_model_price_validation_enforced() -> None:
    base_args = {
        "provider": "P",
        "product_id": "1",
        "plan_name": "N",
        "speed_down_mbit": 100,
        "connection_type": "DSL",
        "contract_duration_months": 12,
    }
    with pytest.raises(
        ValidationError,
        match="Either price_cents_month_intro or price_cents_month_regular must be provided",
    ):
        Offer.model_validate(
            {
                **base_args,
                "price_cents_month_intro": None,
                "price_cents_month_regular": None,
            }
        )
    Offer.model_validate({**base_args, "price_cents_month_intro": 100})
    Offer.model_validate({**base_args, "price_cents_month_regular": 100})


def test_offer_model_tv_included_derivation() -> None:
    base_args_with_price = {
        "provider": "P",
        "product_id": "1",
        "plan_name": "N",
        "speed_down_mbit": 100,
        "connection_type": "DSL",
        "price_cents_month_regular": 100,
        "contract_duration_months": 12,
    }
    test_cases = [
        ("Basic TV", False, True, "Package name set, input False -> True"),
        ("Basic TV", None, True, "Package name set, input None -> True"),
        (None, True, True, "Package name None, input True -> True"),
        (None, False, False, "Package name None, input False -> False"),
        ("", False, False, "Package name empty, input False -> False"),
        ("Premium TV", None, True, "Package name set, tv_included not in dict -> True"),
    ]
    for pkg_name, included_in, expected_out, desc in test_cases:
        current_args = base_args_with_price.copy()
        if pkg_name is not None:
            current_args["tv_package_name"] = pkg_name
        if included_in is not None:
            current_args["tv_included"] = included_in
        offer = Offer.model_validate(current_args)
        assert offer.tv_included == expected_out, f"Test failed for: {desc}"


def test_offer_model_connection_type_normalization() -> None:
    base_args_with_price = {
        "provider": "P",
        "product_id": "1",
        "plan_name": "N",
        "speed_down_mbit": 100,
        "price_cents_month_regular": 100,
        "contract_duration_months": 12,
    }
    normalization_cases = {
        "dsl": "DSL",
        "DSL": "DSL",
        "cable": "Cable",
        "CABLE": "Cable",
        "fiber": "Fiber",
        "FIBER": "Fiber",
        "fibre": "Fiber",
        "fibEr": "Fiber",
        "mobile": "Mobile",
        "MOBILE": "Mobile",
    }
    for input_type, expected_normalized_type in normalization_cases.items():
        offer = Offer.model_validate(
            {**base_args_with_price, "connection_type": input_type}
        )
        assert (
            offer.connection_type == expected_normalized_type
        ), f"Normalization failed for input '{input_type}'"

    # Test for unmappable/invalid connection type
    with pytest.raises(
        ValidationError, match="Input should be 'DSL', 'Cable', 'Fiber' or 'Mobile'"
    ):
        Offer.model_validate({**base_args_with_price, "connection_type": "UnknownTech"})
    with pytest.raises(
        ValidationError, match="Input should be 'DSL', 'Cable', 'Fiber' or 'Mobile'"
    ):
        Offer.model_validate(
            {**base_args_with_price, "connection_type": "random string"}
        )


def test_offer_voucher_percent_sets_voucher_type() -> None:
    base_args_with_price = {
        "provider": "P",
        "product_id": "1",
        "plan_name": "N",
        "speed_down_mbit": 100,
        "connection_type": "DSL",
        "price_cents_month_regular": 100,
        "contract_duration_months": 12,
    }
    test_cases = [
        (
            10.0,
            None,
            VoucherKind.PERCENTAGE,
            "Percent set, type None -> type PERCENTAGE",
        ),
        (
            5.0,
            VoucherKind.ABSOLUTE,
            VoucherKind.PERCENTAGE,
            "Percent set, type different -> type overridden",
        ),
        (
            None,
            VoucherKind.CASHBACK,
            VoucherKind.CASHBACK,
            "Percent None, type set -> type remains",
        ),
        (None, None, None, "Percent None, type None -> type remains None"),
    ]
    for percent_in, type_in, expected_type_out, desc in test_cases:
        current_args = {
            **base_args_with_price,
            "voucher_value_percent": percent_in,
            "voucher_type": type_in,
        }
        offer = Offer.model_validate(current_args)
        assert offer.voucher_type == expected_type_out, f"Test failed for: {desc}"
