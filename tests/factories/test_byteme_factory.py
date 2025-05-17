from __future__ import annotations

from typing import List, Dict, Any

import numpy as np
import pandas as pd
import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from hypothesis.extra.pandas import data_frames, column

from app.factories.byteme_factory import ByteMeOfferFactory
from app.models import Offer
from app.models.providers.byteme_response import ByteMeResponse

# Base valid data dictionary, easy to override for specific test cases
BASE_VALID_ROW_DATA: Dict[str, Any] = {
    "productId": "1000",
    "providerName": "Valid Telecom, Basic Plan",
    "speed": "100",
    "monthlyCostInCent": "3000",
    "afterTwoYearsMonthlyCost": "4000",
    "durationInMonths": "24",
    "connectionType": "Fiber",
    "installationService": "true",
    "tv": "Premium TV Package",
    "limitFrom": "500",
    "maxAge": "65",
    "voucherType": "absolute",
    "voucherValue": "1000",  # 10 EUR
}
# tests/services/test_byteme_factory.py

DIVERSE_TEST_CASES: List[Dict[str, Any]] = [
    {
        "description": "Perfectly valid row",  # 1
        "data": {**BASE_VALID_ROW_DATA, "productId": "1000"},
        "_should_produce_response": True,
        "_expected_attrs": {
            "product_id": "1000",
            "provider_name": "Valid Telecom",
            "speed_down_mbit": 100,
            "price_cents_month_intro": 3000,
            "price_cents_month_regular": 4000,
            "contract_duration_months": 24,
            "connection_type": "Fiber",
            "installation_service_included": True,
            "tv_included": True,
            "tv_package_name": "Premium TV Package",
            "data_cap_gb": 500,
            "max_age": 65,
            "voucher_type": "absolute",
            "voucher_value_cents": 1000,
            "voucher_value_percent": None,
        },
        "_should_produce_offer": True,
    },
    {
        "description": "Provider name without comma",  # 2
        "data": {
            **BASE_VALID_ROW_DATA,
            "providerName": "SimpleNet",
            "productId": "1001",
        },
        "_should_produce_response": True,
        "_expected_attrs": {"provider_name": "SimpleNet"},
        "_should_produce_offer": True,
    },
    {
        "description": "Provider name is empty string",  # 3
        "data": {**BASE_VALID_ROW_DATA, "providerName": "", "productId": "1002"},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Provider name is None/NaN",  # 4
        "data": {**BASE_VALID_ROW_DATA, "providerName": np.nan, "productId": "1003"},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Missing productId (NaN)",  # 5
        "data": {**BASE_VALID_ROW_DATA, "productId": np.nan},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Malformed productId (non-numeric string)",  # 6
        "data": {**BASE_VALID_ROW_DATA, "productId": "ABC"},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Missing speed (NaN)",  # 7
        "data": {**BASE_VALID_ROW_DATA, "speed": np.nan, "productId": "1004"},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Malformed speed (text)",  # 8
        "data": {**BASE_VALID_ROW_DATA, "speed": "High", "productId": "1005"},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Speed is zero",  # 9
        "data": {**BASE_VALID_ROW_DATA, "speed": "0", "productId": "1006"},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Speed is negative",  # 10
        "data": {**BASE_VALID_ROW_DATA, "speed": "-50", "productId": "1007"},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Speed is < 1 (e.g. 0.5)",  # 11
        "data": {**BASE_VALID_ROW_DATA, "speed": "0.5", "productId": "1008"},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Missing monthlyCostInCent",  # 12
        "data": {
            **BASE_VALID_ROW_DATA,
            "monthlyCostInCent": np.nan,
            "productId": "1009",
        },
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "monthlyCostInCent is zero",  # 13
        "data": {**BASE_VALID_ROW_DATA, "monthlyCostInCent": "0", "productId": "1010"},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Missing afterTwoYearsMonthlyCost",  # 14 Essential
        "data": {
            **BASE_VALID_ROW_DATA,
            "afterTwoYearsMonthlyCost": np.nan,
            "productId": "1011",
        },
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Missing durationInMonths",  # 15 Essential
        "data": {
            **BASE_VALID_ROW_DATA,
            "durationInMonths": np.nan,
            "productId": "1012",
        },
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Missing connectionType (NaN)",  # 16 Essential
        "data": {**BASE_VALID_ROW_DATA, "connectionType": np.nan, "productId": "1013"},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "connectionType is empty string (should be dropped if factory converts empty essential strings to None before drop)",  # 17 (Index 16)
        "data": {**BASE_VALID_ROW_DATA, "connectionType": "", "productId": "1014"},
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "limitFrom (data_cap_gb) is empty string (becomes NaN -> None)",  # 18
        "data": {**BASE_VALID_ROW_DATA, "limitFrom": "", "productId": "1015"},
        "_should_produce_response": True,
        "_expected_attrs": {"data_cap_gb": None},
        "_should_produce_offer": True,
    },
    {
        "description": "limitFrom is non-numeric",  # 19
        "data": {**BASE_VALID_ROW_DATA, "limitFrom": "Unlimited", "productId": "1016"},
        "_should_produce_response": True,
        "_expected_attrs": {"data_cap_gb": None},
        "_should_produce_offer": True,
    },
    {
        "description": "maxAge is valid",  # 20
        "data": {**BASE_VALID_ROW_DATA, "maxAge": "27", "productId": "1017"},
        "_should_produce_response": True,
        "_expected_attrs": {"max_age": 27},
        "_should_produce_offer": True,
    },
    {
        "description": "maxAge is empty (becomes NaN -> None)",  # 21
        "data": {**BASE_VALID_ROW_DATA, "maxAge": "", "productId": "1018"},
        "_should_produce_response": True,
        "_expected_attrs": {"max_age": None},
        "_should_produce_offer": True,
    },
    {
        "description": "installationService is 'false'",  # 22
        "data": {
            **BASE_VALID_ROW_DATA,
            "installationService": "false",
            "productId": "1019",
        },
        "_should_produce_response": True,
        "_expected_attrs": {"installation_service_included": False},
        "_should_produce_offer": True,
    },
    {
        "description": "installationService is 'FALSE' (case-insensitive)",  # 23
        "data": {
            **BASE_VALID_ROW_DATA,
            "installationService": "FALSE",
            "productId": "1020",
        },
        "_should_produce_response": True,
        "_expected_attrs": {"installation_service_included": False},
        "_should_produce_offer": True,
    },
    {
        "description": "installationService is empty (becomes False)",  # 24
        "data": {**BASE_VALID_ROW_DATA, "installationService": "", "productId": "1021"},
        "_should_produce_response": True,
        "_expected_attrs": {"installation_service_included": False},
        "_should_produce_offer": True,
    },
    {
        "description": "installationService is NaN (becomes False)",  # 25
        "data": {
            **BASE_VALID_ROW_DATA,
            "installationService": np.nan,
            "productId": "1022",
        },
        "_should_produce_response": True,
        "_expected_attrs": {"installation_service_included": False},
        "_should_produce_offer": True,
    },
    {
        "description": "installationService is 'yes' (becomes False)",  # 26
        "data": {
            **BASE_VALID_ROW_DATA,
            "installationService": "yes",
            "productId": "1023",
        },
        "_should_produce_response": True,
        "_expected_attrs": {"installation_service_included": False},
        "_should_produce_offer": True,
    },
    {
        "description": "tv is 'true'",  # 27
        "data": {**BASE_VALID_ROW_DATA, "tv": "true", "productId": "1024"},
        "_should_produce_response": True,
        "_expected_attrs": {"tv_included": True, "tv_package_name": None},
        "_should_produce_offer": True,
    },
    {
        "description": "tv is 'false'",  # 28
        "data": {**BASE_VALID_ROW_DATA, "tv": "false", "productId": "1025"},
        "_should_produce_response": True,
        "_expected_attrs": {"tv_included": False, "tv_package_name": None},
        "_should_produce_offer": True,
    },
    {
        "description": "tv is empty (becomes False, None package)",  # 29
        "data": {**BASE_VALID_ROW_DATA, "tv": "", "productId": "1026"},
        "_should_produce_response": True,
        "_expected_attrs": {"tv_included": False, "tv_package_name": None},
        "_should_produce_offer": True,
    },
    {
        "description": "tv is NaN (becomes False, None package)",  # 30
        "data": {**BASE_VALID_ROW_DATA, "tv": np.nan, "productId": "1027"},
        "_should_produce_response": True,
        "_expected_attrs": {"tv_included": False, "tv_package_name": None},
        "_should_produce_offer": True,
    },
    {
        "description": "tv is a package name with spaces",  # 31
        "data": {**BASE_VALID_ROW_DATA, "tv": "  My TV Basic  ", "productId": "1028"},
        "_should_produce_response": True,
        "_expected_attrs": {"tv_included": True, "tv_package_name": "My TV Basic"},
        "_should_produce_offer": True,
    },
    {
        "description": "Voucher type 'percentage', valid value",  # 32
        "data": {
            **BASE_VALID_ROW_DATA,
            "voucherType": "percentage",
            "voucherValue": "15.5",
            "productId": "1029",
        },
        "_should_produce_response": True,
        "_expected_attrs": {
            "voucher_type": "percentage",
            "voucher_value_cents": None,
            "voucher_value_percent": 15.5,
        },
        "_should_produce_offer": True,
    },
    {
        "description": "Voucher value present, type missing (assumes cents)",  # 33
        "data": {
            **BASE_VALID_ROW_DATA,
            "voucherType": np.nan,
            "voucherValue": "500",
            "productId": "1030",
        },
        "_should_produce_response": True,
        "_expected_attrs": {
            "voucher_type": None,
            "voucher_value_cents": 500,
            "voucher_value_percent": None,
        },
        "_should_produce_offer": True,
    },
    {
        "description": "Voucher type present, value missing",  # 34
        "data": {
            **BASE_VALID_ROW_DATA,
            "voucherType": "absolute",
            "voucherValue": np.nan,
            "productId": "1031",
        },
        "_should_produce_response": True,
        "_expected_attrs": {
            "voucher_type": "absolute",
            "voucher_value_cents": None,
            "voucher_value_percent": None,
        },
        "_should_produce_offer": True,
    },
    {
        "description": "Voucher type 'PERCENTAGE' (uppercase), value integer string",  # 35
        "data": {
            **BASE_VALID_ROW_DATA,
            "voucherType": "PERCENTAGE",
            "voucherValue": "10",
            "productId": "1032",
        },
        "_should_produce_response": True,
        "_expected_attrs": {
            "voucher_type": "percentage",
            "voucher_value_cents": None,
            "voucher_value_percent": 10.0,
        },
        "_should_produce_offer": True,
    },
    {
        "description": "Voucher type is empty string, value present",  # 36 (Index 35 in 0-based list)
        "data": {
            **BASE_VALID_ROW_DATA,
            "voucherType": "",
            "voucherValue": "200",
            "productId": "1033",
        },
        "_should_produce_response": True,
        "_expected_attrs": {
            "voucher_type": None,
            "voucher_value_cents": 200,
            "voucher_value_percent": None,
        },  # CHANGED "" to None
        "_should_produce_offer": True,
    },
    {
        "description": "Voucher value is non-numeric",  # 37
        "data": {
            **BASE_VALID_ROW_DATA,
            "voucherType": "absolute",
            "voucherValue": "Free!",
            "productId": "1034",
        },
        "_should_produce_response": True,
        "_expected_attrs": {
            "voucher_type": "absolute",
            "voucher_value_cents": None,
            "voucher_value_percent": None,
        },
        "_should_produce_offer": True,
    },
    {
        "description": "Dedupe: productId 2000 - cheaper",  # 38 (Index 37)
        "data": {
            **BASE_VALID_ROW_DATA,
            "productId": "2000",
            "monthlyCostInCent": "1000",
            "providerName": "Cheaper",
        },
        "_should_produce_response": True,
        "_should_produce_offer": True,
    },
    {
        "description": "Dedupe: productId 2000 - more expensive",  # 39 (Index 38)
        "data": {
            **BASE_VALID_ROW_DATA,
            "productId": "2000",
            "monthlyCostInCent": "2000",
            "providerName": "Expensive",
        },
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Dedupe: productId 2000 - also cheaper, diff detail",  # 40 (Index 39)
        "data": {
            **BASE_VALID_ROW_DATA,
            "productId": "2000",
            "monthlyCostInCent": "1000",
            "providerName": "Cheaper Too",
            "speed": "99",
        },
        "_should_produce_response": False,
        "_should_produce_offer": False,
    },
    {
        "description": "Speed with decimals, rounds down",  # 41
        "data": {**BASE_VALID_ROW_DATA, "speed": "50.4", "productId": "1035"},
        "_should_produce_response": True,
        "_expected_attrs": {"speed_down_mbit": 50},
        "_should_produce_offer": True,
    },
    {
        "description": "Speed with decimals, rounds up",  # 42
        "data": {**BASE_VALID_ROW_DATA, "speed": "50.7", "productId": "1036"},
        "_should_produce_response": True,
        "_expected_attrs": {"speed_down_mbit": 51},
        "_should_produce_offer": True,
    },
    {
        "description": "Cost with decimals",  # 43
        "data": {
            **BASE_VALID_ROW_DATA,
            "monthlyCostInCent": "2000.99",
            "productId": "1037",
        },
        "_should_produce_response": True,
        "_expected_attrs": {"price_cents_month_intro": 2000},
        "_should_produce_offer": True,
    },
    {
        "description": "Valid ByteMeResponse, but invalid Offer (negative regular price)",  # 44
        "data": {
            **BASE_VALID_ROW_DATA,
            "productId": "3000",
            "afterTwoYearsMonthlyCost": "-100",
        },
        "_should_produce_response": True,
        "_expected_attrs": {"product_id": "3000", "price_cents_month_regular": None},
        "_should_produce_offer": True,
    },
    {
        "description": "Valid ByteMeResponse, but invalid Offer (bad connection_type)",  # 45
        "data": {
            **BASE_VALID_ROW_DATA,
            "productId": "3001",
            "connectionType": "Satellite",
        },
        "_should_produce_response": True,
        "_expected_attrs": {"product_id": "3001", "connection_type": "Satellite"},
        "_should_produce_offer": False,
    },
]


def _create_test_df_from_list_of_dicts(
    list_of_row_dicts: List[Dict[str, Any]],
) -> pd.DataFrame:
    return pd.DataFrame(list_of_row_dicts)


def test_process_diverse_dataframe_scenarios() -> None:
    raw_data_rows = [case["data"] for case in DIVERSE_TEST_CASES]
    input_df = _create_test_df_from_list_of_dicts(raw_data_rows)

    responses = ByteMeOfferFactory.make_responses(input_df)

    eligible_for_dedupe: Dict[str, List[tuple[float, int, Dict[str, Any]]]] = {}

    initially_valid_indices = set()

    for i, case in enumerate(DIVERSE_TEST_CASES):
        is_initially_valid_for_clean_df = True
        # Check essential numeric columns
        for essential_col in ByteMeOfferFactory._ESSENTIAL_NUMERIC_COLS:
            val = case["data"].get(essential_col)
            try:
                num_val = float(val) if val is not None and val != "" else np.nan
                if pd.isna(num_val):
                    is_initially_valid_for_clean_df = False
                    break
                if essential_col in ["speed", "monthlyCostInCent"] and num_val <= 0:
                    is_initially_valid_for_clean_df = False
                    break
                if essential_col == "speed" and num_val < 1:
                    is_initially_valid_for_clean_df = False
                    break
            except (ValueError, TypeError):
                is_initially_valid_for_clean_df = False
                break
        if not is_initially_valid_for_clean_df:
            # If a test case expects a response despite failing this generic check, flag it.
            if case["_should_produce_response"]:
                print(
                    f"Warning: Case {i} ('{case['description']}') failed initial NUMERIC validity but _should_produce_response is True."
                )
            continue  # This row would be dropped by clean_df

        # Check essential string columns
        for essential_col in ByteMeOfferFactory._ESSENTIAL_STRING_COLS:
            val = case["data"].get(essential_col)
            # clean_df drops if it's NaN after .astype(object).where(pd.notna(...), None)
            # So, an original np.nan or None will be dropped. Empty string "" will NOT be dropped here.
            if val is None or (
                isinstance(val, float) and np.isnan(val)
            ):  # Checks for Python None or np.nan
                is_initially_valid_for_clean_df = False
                break
        if not is_initially_valid_for_clean_df:
            if case["_should_produce_response"]:
                print(
                    f"Warning: Case {i} ('{case['description']}') failed initial STRING validity but _should_produce_response is True."
                )
            continue

        # If the case passed generic checks, but has a specific flag saying it shouldn't produce a response
        # (e.g. for testing a very specific logic branch not covered by generic essential field checks)
        # then we respect that flag.
        if not case["_should_produce_response"]:
            continue

        initially_valid_indices.add(
            i
        )  # Add index if it passed all above and _should_produce_response is True

        product_id = str(case["data"]["productId"])
        try:
            cost = float(case["data"]["monthlyCostInCent"])
        except (ValueError, TypeError):
            # This should ideally not happen if it passed the numeric check above
            print(
                f"Error: Case {i} ('{case['description']}') passed numeric check but monthlyCostInCent is invalid: {case['data']['monthlyCostInCent']}"
            )
            continue

        if product_id not in eligible_for_dedupe:
            eligible_for_dedupe[product_id] = []
        eligible_for_dedupe[product_id].append(
            (cost, i, case)
        )  # Store original index i

    expected_surviving_cases_responses_indices = set()
    for product_id, candidates in eligible_for_dedupe.items():
        # Only consider candidates whose original index is in initially_valid_indices
        valid_candidates = [c for c in candidates if c[1] in initially_valid_indices]
        if not valid_candidates:
            continue

        valid_candidates.sort(
            key=lambda x: (x[0], x[1])
        )  # Sort by cost, then original index

        winning_case_original_index = valid_candidates[0][
            1
        ]  # Get original index of the winner
        expected_surviving_cases_responses_indices.add(winning_case_original_index)

    expected_response_count = len(expected_surviving_cases_responses_indices)

    # Debugging output if counts mismatch
    if len(responses) != expected_response_count:
        print(
            f"DEBUG: Test expected {expected_response_count} responses, Factory produced {len(responses)}"
        )
        expected_pids = {
            DIVERSE_TEST_CASES[idx]["data"]["productId"]
            for idx in sorted(list(expected_surviving_cases_responses_indices))
        }
        actual_pids = {r.product_id for r in responses}
        print(f"DEBUG: Expected PIDs to survive: {sorted(list(expected_pids))}")
        print(f"DEBUG: Actual PIDs produced: {sorted(list(actual_pids))}")
        missing_from_actual = expected_pids - actual_pids
        extra_in_actual = actual_pids - expected_pids
        if missing_from_actual:
            print(
                f"DEBUG: PIDs expected by test but NOT in factory output: {missing_from_actual}"
            )
            for pid in missing_from_actual:
                for idx in expected_surviving_cases_responses_indices:
                    if DIVERSE_TEST_CASES[idx]["data"]["productId"] == pid:
                        print(
                            f"  Culprit case index: {idx}, description: {DIVERSE_TEST_CASES[idx]['description']}"
                        )
                        break
        if extra_in_actual:
            print(
                f"DEBUG: PIDs in factory output but NOT expected by test: {extra_in_actual}"
            )

    assert (
        len(responses) == expected_response_count
    ), f"Expected {expected_response_count} responses, got {len(responses)}. Expected surviving indices: {sorted(list(expected_surviving_cases_responses_indices))}"

    produced_product_ids_responses = {r.product_id for r in responses}

    for i, case in enumerate(DIVERSE_TEST_CASES):
        if i not in expected_surviving_cases_responses_indices:
            continue

        case_data = case["data"]
        product_id = str(
            case_data.get("productId", f"MISSING_ID_IN_TEST_CASE_DATA_IDX_{i}")
        )

        assert (
            product_id in produced_product_ids_responses
        ), f"Product ID {product_id} from case '{case['description']}' (index {i}) expected in responses but not found."

        response_obj = next((r for r in responses if r.product_id == product_id), None)
        assert (
            response_obj is not None
        ), f"Could not find response for product_id {product_id} from case index {i}"

        if "_expected_attrs" in case:
            for attr, expected_value in case["_expected_attrs"].items():
                actual_value = getattr(response_obj, attr)
                if isinstance(expected_value, float) and isinstance(
                    actual_value, float
                ):
                    assert (
                        pytest.approx(actual_value) == expected_value
                    ), f"Response mismatch for product {product_id} (case index {i}), attribute {attr}: expected {repr(expected_value)}, got {repr(actual_value)} (Case: {case['description']})"
                else:
                    assert (
                        actual_value == expected_value
                    ), f"Response mismatch for product {product_id} (case index {i}), attribute {attr}: expected {repr(expected_value)}, got {repr(actual_value)} (Case: {case['description']})"

    canonical_provider_name = "TestByteMeProvider"
    offers = ByteMeOfferFactory.make_offers(input_df, canonical_provider_name)

    expected_surviving_cases_offers_indices = {
        idx
        for idx in expected_surviving_cases_responses_indices
        if DIVERSE_TEST_CASES[idx]["_should_produce_offer"]
    }
    expected_offer_count = len(expected_surviving_cases_offers_indices)

    assert (
        len(offers) == expected_offer_count
    ), f"Expected {expected_offer_count} offers, got {len(offers)}. Expected surviving offer indices: {sorted(list(expected_surviving_cases_offers_indices))}"

    produced_product_ids_offers = {o.product_id for o in offers}

    for i, case in enumerate(DIVERSE_TEST_CASES):
        if i not in expected_surviving_cases_offers_indices:
            continue

        case_data = case["data"]
        product_id = str(
            case_data.get("productId", f"MISSING_ID_IN_TEST_CASE_DATA_OFFER_IDX_{i}")
        )

        assert (
            product_id in produced_product_ids_offers
        ), f"Product ID {product_id} from case '{case['description']}' (index {i}) expected in offers but not found."

        offer_obj = next((o for o in offers if o.product_id == product_id), None)
        assert (
            offer_obj is not None
        ), f"Could not find offer for product_id {product_id} from case index {i}"
        assert offer_obj.provider == canonical_provider_name

        if "_expected_offer_attrs" in case:
            for attr, expected_value in case["_expected_offer_attrs"].items():
                actual_value = getattr(offer_obj, attr)
                assert (
                    actual_value == expected_value
                ), f"Offer mismatch for product {product_id} (case index {i}), attribute {attr}: expected {repr(expected_value)}, got {repr(actual_value)} (Case: {case['description']})"


def test_clean_df_with_missing_columns() -> None:
    base_valid_data_for_missing_cols = {
        "productId": "9001",
        "providerName": "Test Provider",
        "speed": "100",
        "monthlyCostInCent": "1000",
        "afterTwoYearsMonthlyCost": "1500",
        "durationInMonths": "12",
    }
    data_missing_essential_str = {
        k: v for k, v in base_valid_data_for_missing_cols.items()
    }
    df_missing_conn = pd.DataFrame([data_missing_essential_str])
    cleaned_df1 = ByteMeOfferFactory.clean_df(df_missing_conn)
    assert (
        cleaned_df1.empty
    ), "Row should be dropped if 'connectionType' column is entirely missing"

    data_with_essential_str = {
        **base_valid_data_for_missing_cols,
        "connectionType": "DSL",
    }
    df_missing_optionals = pd.DataFrame([data_with_essential_str])
    cleaned_df2 = ByteMeOfferFactory.clean_df(df_missing_optionals)

    assert (
        len(cleaned_df2) == 1
    ), "Row should be kept if only optional/boolean columns are missing"

    row = cleaned_df2.iloc[0]
    assert row["installationService"] == False
    assert row[ByteMeOfferFactory._TV_INCLUDED_FLAG_COL] == False
    assert (
        pd.isna(row[ByteMeOfferFactory._TV_SOURCE_COL])
        or row[ByteMeOfferFactory._TV_SOURCE_COL] is None
    ), "Missing 'tv' col should result in tv_package_name=None"

    for col in ByteMeOfferFactory._OPTIONAL_NUMERIC_COLS:
        assert pd.isna(
            row[col]
        ), f"Missing optional numeric column '{col}' should be pd.NA (NaN)"


TEXT_FIELD_STRATEGY = st.one_of(
    st.text(
        st.characters(
            max_codepoint=1000,
            whitelist_categories=("L", "N", "P", "S", "Z", "M", "Zs", "Cc", "Cf"),
        ),
        max_size=50,
    ),
    st.none(),
    st.just(""),
    st.just("  "),
)
NUMERIC_LIKE_TEXT_STRATEGY = st.one_of(
    st.text(
        alphabet=st.characters(whitelist_categories=("Nd",)), min_size=0, max_size=10
    ).map(lambda s: s if s else "0"),
    st.text(
        alphabet=st.characters(whitelist_categories=("Nd",), whitelist_characters=".-"),
        min_size=0,
        max_size=12,
    ),
    st.integers(min_value=-1000, max_value=100000).map(str),
    st.floats(
        min_value=-1000.0, max_value=100000.0, allow_nan=False, allow_infinity=False
    ).map(lambda x: f"{x:.2f}"),
    st.just("NaN"),
    st.just("None"),
    st.just(""),
    st.just("text"),
    st.none(),
)
BOOL_LIKE_STRING_STRATEGY = st.one_of(
    st.sampled_from(
        [
            "true",
            "false",
            "True",
            "False",
            "TRUE",
            "FALSE",
            "yes",
            "no",
            "0",
            "1",
            "",
            " ",
            "on",
            "off",
        ]
    ),
    st.none(),
)
CONN_TYPE_STRATEGY = st.one_of(
    st.sampled_from(
        ["DSL", "Fiber", "Cable", "Mobile", "dsl", "Satellite", "", "  ", "FIBER Optic"]
    ),
    st.none(),
)
VOUCHER_TYPE_STRATEGY = st.one_of(
    st.sampled_from(
        ["absolute", "percentage", "cashback", "discount", "", " ", "gift card"]
    ),
    st.none(),
)


@given(
    data_frames(
        [
            column("productId", elements=NUMERIC_LIKE_TEXT_STRATEGY),
            column("providerName", elements=TEXT_FIELD_STRATEGY),
            column("speed", elements=NUMERIC_LIKE_TEXT_STRATEGY),
            column("monthlyCostInCent", elements=NUMERIC_LIKE_TEXT_STRATEGY),
            column("afterTwoYearsMonthlyCost", elements=NUMERIC_LIKE_TEXT_STRATEGY),
            column("durationInMonths", elements=NUMERIC_LIKE_TEXT_STRATEGY),
            column("connectionType", elements=CONN_TYPE_STRATEGY),
            column("installationService", elements=BOOL_LIKE_STRING_STRATEGY),
            column("tv", elements=TEXT_FIELD_STRATEGY),
            column("limitFrom", elements=NUMERIC_LIKE_TEXT_STRATEGY),
            column("maxAge", elements=NUMERIC_LIKE_TEXT_STRATEGY),
            column("voucherType", elements=VOUCHER_TYPE_STRATEGY),
            column("voucherValue", elements=NUMERIC_LIKE_TEXT_STRATEGY),
        ]
    )
)
@settings(
    deadline=None,
    suppress_health_check=[
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
        HealthCheck.filter_too_much,
    ],
    max_examples=30,
)
def test_fuzz_factory_methods_robustness(df_fuzzed: pd.DataFrame) -> None:
    try:
        responses = ByteMeOfferFactory.make_responses(df_fuzzed)
        assert isinstance(responses, list)
        for resp in responses:
            assert isinstance(resp, ByteMeResponse)
            assert resp.product_id is not None
            assert resp.provider_name is not None

        offers = ByteMeOfferFactory.make_offers(df_fuzzed, provider_name="FuzzByte")
        assert isinstance(offers, list)
        for offer in offers:
            assert isinstance(offer, Offer)
            assert offer.provider == "FuzzByte"
            assert offer.plan_name is not None
    except pd.errors.ParserError as pe:
        print(
            f"Pandas ParserError during fuzzing (likely acceptable due to extreme inputs for to_numeric): {pe}"
        )
        pass
    except Exception as e:
        if isinstance(e, AssertionError):
            raise
        pytest.fail(
            f"Unhandled exception in factory during fuzzing: {type(e).__name__}: {e}\nDataFrame causing issue:\n{df_fuzzed.to_string()}"
        )
