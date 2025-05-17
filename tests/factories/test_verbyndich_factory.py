import random
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck

from app.models import Address

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.factories.verbyndich_factory import VerbynDichFactory
from app.models.providers.verbyndich_response import VerbynDichResponse, VoucherKind
from pydantic import ValidationError


REAL_WORLD_EXAMPLES_RAW: List[Dict[str, Any]] = [
    {
        "product": "VerbynDich Basic 200",
        "description": "Dieses einzigartige Angebot ist der perfekte Match für Sie. Für nur 43€ im Monat erhalten Sie eine Cable-Verbindung mit einer Geschwindigkeit von 200 Mbit/s. Zögern Sie nicht und schlagen Sie jetzt zu!\n\nBitte beachten Sie, dass die Mindestvertragslaufzeit 12 Monate beträgt. Ab 250GB pro Monat wird die Geschwindigkeit gedrosselt. Mit diesem Angebot erhalten Sie einen einmaligen Rabatt von 108€ auf Ihre monatliche Rechnung. Der Mindestbestellwert beträgt 8€. Ab dem 24. Monat beträgt der monatliche Preis 41€.",
        "last": False,
        "valid": True,
    },
    {
        "product": "VerbynDich Basic 25",
        "description": "Dieses einzigartige Angebot ist der perfekte Match für Sie. Für nur 28€ im Monat erhalten Sie eine DSL-Verbindung mit einer Geschwindigkeit von 25 Mbit/s. Zögern Sie nicht und schlagen Sie jetzt zu!\n\nBitte beachten Sie, dass die Mindestvertragslaufzeit 12 Monate beträgt. Ab 250GB pro Monat wird die Geschwindigkeit gedrosselt. Mit diesem Angebot erhalten Sie einen einmaligen Rabatt von 108€ auf Ihre monatliche Rechnung. Der Mindestbestellwert beträgt 8€.",
        "last": False,
        "valid": True,
    },
    {
        "product": "VerbynDich Premium 50 Young",
        "description": "Dieses einzigartige Angebot ist der perfekte Match für Sie. Für nur 38€ im Monat erhalten Sie eine DSL-Verbindung mit einer Geschwindigkeit von 50 Mbit/s. Zusätzlich sind folgende Fernsehsender enthalten RobynTV+. Zögern Sie nicht und schlagen Sie jetzt zu!\n\nBitte beachten Sie, dass die Mindestvertragslaufzeit 12 Monate beträgt. Dieses Angebot ist nur für Personen unter 27 Jahren verfügbar. Mit diesem Angebot erhalten Sie einen einmaligen Rabatt von 108€ auf Ihre monatliche Rechnung. Der Mindestbestellwert beträgt 8€. Ab dem 24. Monat beträgt der monatliche Preis 37€.",
        "last": False,
        "valid": True,
    },
    {  # Example with percentage voucher and cap
        "product": "VerbynDich Special 100",
        "description": "Super Deal! Für nur 50€ im Monat, 100 Mbit. Rabatt von 10% (maximaler Rabatt beträgt 5€). Mindestvertragslaufzeit 24 Monate.",
        "last": False,
        "valid": True,
    },
    {  # Example with voucher until month
        "product": "VerbynDich Promo 50",
        "description": "Aktion! Für nur 30€ im Monat, 50 Mbit. Rabatt von 20€ bis zum 6 . Monat. Mindestvertragslaufzeit 12 Monate.",
        "last": False,
        "valid": True,
    },
    {  # Invalid offer
        "product": "VerbynDich Invalid",
        "description": "This offer is not valid.",
        "last": False,
        "valid": False,
    },
    {  # Duplicate of first item for testing parse_responses deduplication
        "product": "VerbynDich Basic 200",
        "description": "Dieses einzigartige Angebot ist der perfekte Match für Sie. Für nur 43€ im Monat erhalten Sie eine Cable-Verbindung mit einer Geschwindigkeit von 200 Mbit/s. Zögern Sie nicht und schlagen Sie jetzt zu!\n\nBitte beachten Sie, dass die Mindestvertragslaufzeit 12 Monate beträgt. Ab 250GB pro Monat wird die Geschwindigkeit gedrosselt. Mit diesem Angebot erhalten Sie einen einmaligen Rabatt von 108€ auf Ihre monatliche Rechnung. Der Mindestbestellwert beträgt 8€. Ab dem 24. Monat beträgt der monatliche Preis 41€.",
        "last": False,
        "valid": True,
    },
]


class TestVerbynDichFactory:
    """Test suite for the VerbynDichFactory."""

    def test_build_body_valid_address(self) -> None:
        """Test build_body with a valid Address object."""
        address = Address(
            street="Musterstraße",
            house_number="123b",
            city="Musterstadt",
            plz="12345",
            country_code="DE",
        )
        expected_body = "Musterstraße;123b;Musterstadt;12345"
        assert VerbynDichFactory.build_body(address) == expected_body

    @pytest.mark.parametrize(
        "address_data, error_field",
        [
            (
                {"street": "", "house_number": "1", "city": "Test", "plz": "12345"},
                "street",
            ),
            (
                {"street": "Test", "house_number": "1", "city": "Test", "plz": "1234"},
                "plz",
            ),
        ],
    )
    def test_build_body_invalid_address(
        self, address_data: Dict[str, str], error_field: str
    ) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _ = Address(**address_data)  # type: ignore
        assert error_field in str(exc_info.value).lower()

    @pytest.mark.parametrize(
        "raw_data, expected",
        [
            pytest.param(
                REAL_WORLD_EXAMPLES_RAW[0],
                VerbynDichResponse(
                    valid=True,
                    last=False,
                    price_cents_month=4300,
                    speed_down_mbit=200,
                    contract_duration_months=12,
                    max_age=None,
                    voucher_type=VoucherKind.ABSOLUTE,
                    voucher_value_cents=10800,
                    voucher_value_percent=None,
                    voucher_value_cap=None,
                    voucher_until_month=None,
                    connection_type="Cable",
                    tv_package_name=None,
                    tv_included=False,
                    data_cap_gb=250,
                    promo_month=24,
                    promo_price_cents=4100,
                    min_order_cents=800,
                    plan_name="Basic 200",
                ),
                id="real_world_basic_200_cable_promo",
            ),
            pytest.param(
                REAL_WORLD_EXAMPLES_RAW[1],
                VerbynDichResponse(
                    valid=True,
                    last=False,
                    price_cents_month=2800,
                    speed_down_mbit=25,
                    contract_duration_months=12,
                    max_age=None,
                    voucher_type=VoucherKind.ABSOLUTE,
                    voucher_value_cents=10800,
                    voucher_value_percent=None,
                    voucher_value_cap=None,
                    voucher_until_month=None,
                    connection_type="DSL",
                    tv_package_name=None,
                    tv_included=False,
                    data_cap_gb=250,
                    promo_month=None,
                    promo_price_cents=None,
                    min_order_cents=800,
                    plan_name="Basic 25",
                ),
                id="real_world_basic_25_dsl_datacap_no_promo",
            ),
            pytest.param(
                REAL_WORLD_EXAMPLES_RAW[2],
                VerbynDichResponse(
                    valid=True,
                    last=False,
                    price_cents_month=3800,
                    speed_down_mbit=50,
                    contract_duration_months=12,
                    max_age=27,
                    voucher_type=VoucherKind.ABSOLUTE,
                    voucher_value_cents=10800,
                    voucher_value_percent=None,
                    voucher_value_cap=None,
                    voucher_until_month=None,
                    connection_type="DSL",
                    tv_package_name="RobynTV+",
                    tv_included=True,  # Factory should capture this. Test will fail if factory doesn't.
                    data_cap_gb=None,
                    promo_month=24,
                    promo_price_cents=3700,
                    min_order_cents=800,
                    plan_name="Premium 50 Young",
                ),
                id="real_world_premium_50_young_tv_promo",
            ),
            pytest.param(
                REAL_WORLD_EXAMPLES_RAW[3],
                VerbynDichResponse(
                    valid=True,
                    last=False,
                    price_cents_month=5000,
                    speed_down_mbit=100,
                    contract_duration_months=24,
                    max_age=None,
                    voucher_type=VoucherKind.PERCENTAGE,
                    voucher_value_cents=None,
                    voucher_value_percent=10.0,
                    voucher_value_cap=500,
                    voucher_until_month=None,
                    connection_type="DSL",
                    tv_package_name=None,
                    tv_included=False,
                    data_cap_gb=None,
                    promo_month=None,
                    promo_price_cents=None,
                    min_order_cents=None,
                    plan_name="Special 100",
                ),
                id="percentage_voucher_with_cap",
            ),
            pytest.param(
                REAL_WORLD_EXAMPLES_RAW[4],
                VerbynDichResponse(
                    valid=True,
                    last=False,
                    price_cents_month=3000,
                    speed_down_mbit=50,
                    contract_duration_months=12,
                    max_age=None,
                    voucher_type=VoucherKind.ABSOLUTE,
                    voucher_value_cents=2000,
                    voucher_value_percent=None,
                    voucher_value_cap=None,
                    voucher_until_month=6,
                    connection_type="DSL",
                    tv_package_name=None,
                    tv_included=False,
                    data_cap_gb=None,
                    promo_month=None,
                    promo_price_cents=None,
                    min_order_cents=None,
                    plan_name="Promo 50",
                ),
                id="voucher_until_month",
            ),
        ],
    )
    def test_parse_response_real_world_examples(
        self, raw_data: Dict[str, Any], expected: VerbynDichResponse
    ) -> None:
        """Test parse_response with various real-world data examples. Logging check removed."""
        result = VerbynDichFactory.parse_response(raw_data)
        assert result == expected

    def test_parse_response_invalid_offer(self) -> None:
        raw_data = {
            "product": "Test",
            "description": "...",
            "valid": False,
            "last": False,
        }
        assert VerbynDichFactory.parse_response(raw_data) is None

    @pytest.mark.parametrize(
        "description_snippet, expected_field, expected_value",
        [
            ("für nur 9,99 € im Monat", "price_cents_month", 999),
            ("für nur 123 € im Monat", "price_cents_month", 12300),
            ("Geschwindigkeit 55.5 Mbit", "speed_down_mbit", 56),
            ("Geschwindigkeit 55.4 Mbit", "speed_down_mbit", 55),
            ("1000 Mbit schnell", "speed_down_mbit", 1000),
            ("Mindestvertragslaufzeit 6 Monate", "contract_duration_months", 6),
            ("nur für Leute unter 25 Jahre", "max_age", 25),
            ("bis 28 Jahre alt", "max_age", 28),
            ("Rabatt von 15,50 €", "voucher_value_cents", 1550),
            ("Rabatt von 10 %", "voucher_value_percent", 10.0),
            (
                "Rabatt von 10 %, maximaler Rabatt beträgt 20€",
                "voucher_value_cap",
                2000,
            ),
            (
                "Rabatt von 15%, maximale Rabatt beträgt 20,50€",
                "voucher_value_cap",
                2050,
            ),
            ("eine Fiber-Verbindung", "connection_type", "Fiber"),
            ("Anschlussart: Kabel", "connection_type", "Cable"),
            ("Mobile Tarif", "connection_type", "Mobile"),
            (
                "Paket: MyFunTV und SuperHDTV+",
                "tv_package_name",
                "MyFunTV, SuperHDTV+",
            ),  # Expects factory to capture +
            ("TV Paket: SingleTV", "tv_package_name", "SingleTV"),
            (
                "TV Paket: SingleTV+",
                "tv_package_name",
                "SingleTV+",
            ),  # Expects factory to capture +
            ("TV Paket: SingleTV+", "tv_included", True),
            ("Ab 100 GB Volumen", "data_cap_gb", 100),
            ("Ab dem 7. Monat monatliche Preis 29,99 €", "promo_price_cents", 2999),
            ("Ab dem 7. Monat monatliche Preis 29,99 €", "promo_month", 7),
            ("Mindestbestellwert beträgt 15 €", "min_order_cents", 1500),
            ("Rabatt von 10€ bis zum 3. Monat", "voucher_until_month", 3),
        ],
    )
    def test_parse_response_specific_extractions(
        self, description_snippet: str, expected_field: str, expected_value: Any
    ) -> None:
        raw_data = {
            "product": "VerbynDich Test",
            "description": f"Basis Info. {description_snippet}. für nur 1 € im Monat. Mehr Text.",
            "valid": True,
            "last": False,
        }
        result = VerbynDichFactory.parse_response(raw_data)
        assert result is not None
        assert getattr(result, expected_field) == expected_value
        if expected_field == "tv_package_name" and expected_value is not None:
            assert result.tv_included is True
        elif expected_field == "tv_package_name" and expected_value is None:
            assert result.tv_included is False

    @pytest.mark.parametrize(
        "malformed_snippet, field_name, default_value_or_none",
        [
            ("für nur XYZ € im Monat", "price_cents_month", None),
            ("ABC Mbit Speed", "speed_down_mbit", 16),
            ("Mindestvertragslaufzeit XYZ Monate", "contract_duration_months", 24),
            ("Rabatt von ABC €", "voucher_value_cents", None),
            ("Rabatt von XYZ %", "voucher_value_percent", None),
            (
                "Rabatt von 10%, maximaler Rabatt beträgt ABC €",
                "voucher_value_cap",
                None,
            ),
            ("Ab XYZ GB", "data_cap_gb", None),
            ("Ab dem X. Monat monatliche Preis Y €", "promo_month", None),
            ("Ab dem 6. Monat monatliche Preis Y €", "promo_price_cents", None),
            ("Mindestbestellwert beträgt XYZ €", "min_order_cents", None),
            ("Rabatt von 10€ bis zum ABC. Monat", "voucher_until_month", None),
        ],
    )
    def test_parse_response_malformed_values(
        self, malformed_snippet: str, field_name: str, default_value_or_none: Any
    ) -> None:
        base_desc = "Info."
        if field_name == "voucher_value_cap" and "Rabatt von" not in malformed_snippet:
            base_desc += " Rabatt von 10 %."

        # Include a valid price snippet for non-price_cents_month tests so price is present
        if field_name != "price_cents_month":
            desc = f"{base_desc} für nur 1 € im Monat {malformed_snippet}. Rest."
        else:
            desc = f"{base_desc} {malformed_snippet}. Rest."

        raw_data = {
            "product": "VerbynDich Malformed",
            "description": desc,
            "valid": True,
            "last": False,
        }
        result = VerbynDichFactory.parse_response(raw_data)
        # price_cents_month is required: if malformed or missing, parser should return None
        if field_name == "price_cents_month":
            assert result is None
            return
        assert result is not None
        assert getattr(result, field_name) == default_value_or_none

        # If both voucher_value_cents and voucher_value_percent are None, voucher_type should be None
        if (
            (field_name == "voucher_value_cents" and default_value_or_none is None)
            or (field_name == "voucher_value_percent" and default_value_or_none is None)
            or (field_name == "voucher_value_cap" and default_value_or_none is None)
        ):
            if (
                getattr(result, "voucher_value_cents", None) is None
                and getattr(result, "voucher_value_percent", None) is None
            ):
                assert getattr(result, "voucher_type", None) is None

    @pytest.mark.parametrize(
        "product_name, expected_plan_name",
        [
            ("VerbynDich My Awesome Plan", "My Awesome Plan"),
            ("VerbynDich SuperDeal", "SuperDeal"),
            ("VerbynDich Special Young", "Special Young"),
            ("OtherProvider Plan X", "OtherProvider Plan X"),
            ("VerbynDich", "VerbynDich"),
            ("verbyndich Lowercase Plan", "Lowercase Plan"),
            ("VerbynDich  Plan With Spaces", "Plan With Spaces"),
        ],
    )
    def test_parse_response_plan_name_cleaning(
        self, product_name: str, expected_plan_name: str
    ) -> None:
        raw_data = {
            "product": product_name,
            "description": "für nur 1 € im Monat. Mindestvertragslaufzeit 12 Monate.",
            "valid": True,
            "last": False,
        }
        result = VerbynDichFactory.parse_response(raw_data)
        assert result is not None
        assert result.plan_name == expected_plan_name

    def test_parse_response_empty_description_and_product(self) -> None:
        raw_data = {"product": "", "description": "", "valid": True, "last": False}
        result = VerbynDichFactory.parse_response(raw_data)
        assert result is None

    def test_parse_response_missing_keys_in_data(self) -> None:
        raw_data_no_desc = {"product": "Test", "valid": True, "last": False}
        result_no_desc = VerbynDichFactory.parse_response(raw_data_no_desc)
        assert result_no_desc is None

        raw_data_no_product = {"description": "Test desc", "valid": True, "last": False}
        result_no_product = VerbynDichFactory.parse_response(raw_data_no_product)
        assert result_no_product is None

        raw_data_no_valid = {
            "product": "Test",
            "description": "Test desc",
            "last": False,
        }
        result_no_valid = VerbynDichFactory.parse_response(raw_data_no_valid)
        assert result_no_valid is None


# --- Reusable strategies ---------------------------------------------------- #

number_strings_st = st.one_of(
    st.integers(min_value=0, max_value=10_000).map(str),
    st.floats(
        min_value=0.0,
        max_value=10_000,
        allow_nan=False,
        allow_infinity=False,
    ).map(
        lambda x: (
            f"{x:.2f}".replace(".", random.choice([",", "."])) if x > 0.001 else "0"
        )
    ),
)
general_text_for_numbers_st = st.one_of(
    number_strings_st,
    st.text(
        alphabet="abcdefghijklmnopqrstuvwxyz!@#$&()_+[]{}",
        min_size=1,
        max_size=10,
    ),
)
safe_text_st = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,-'\"\\n",
    max_size=50,
)


@st.composite
def generate_description_fuzz(draw: st.DrawFn) -> str:
    """Create a semi-structured German marketing blurb with random snippets."""
    parts: list[str] = []

    if draw(st.booleans()):
        parts.append(f"für nur {draw(general_text_for_numbers_st)} € im Monat")

    if draw(st.booleans()):
        parts.append(f"{draw(general_text_for_numbers_st)} Mbit")

    if draw(st.booleans()):
        parts.append(
            f"Mindestvertragslaufzeit {draw(general_text_for_numbers_st)} Monat"
        )

    if draw(st.booleans()):
        age_prefix = draw(st.sampled_from(["unter", "bis", ""]))
        parts.append(f"{age_prefix} {draw(general_text_for_numbers_st)} Jahr")

    if draw(st.booleans()):
        parts.append(f"Rabatt von {draw(general_text_for_numbers_st)} €")

    if draw(st.booleans()):
        parts.append(f"Rabatt von {draw(general_text_for_numbers_st)} %")
        if draw(st.booleans()):
            cap_prefix = draw(st.sampled_from(["maximale", "maximaler", "max.", ""]))
            parts.append(
                f"{cap_prefix} Rabatt beträgt {draw(general_text_for_numbers_st)} €"
            )

    if draw(st.booleans()):
        parts.append(
            f"eine {draw(st.sampled_from(['DSL', 'Cable', 'Kabel', 'Fiber', 'Glasfaser', 'Mobile']))}-Verbindung"
        )

    if draw(st.booleans()):
        tv_name = draw(
            st.text(
                alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
                min_size=1,
                max_size=10,
            )
        )
        parts.append(
            f"Fernsehsender enthalten {tv_name}TV{draw(st.sampled_from(['', '+']))}"
        )

    if draw(st.booleans()):
        parts.append(f"Ab {draw(general_text_for_numbers_st)} GB")

    if draw(st.booleans()):
        parts.append(
            f"Ab dem {draw(general_text_for_numbers_st)}. Monat monatliche Preis "
            f"{draw(general_text_for_numbers_st)} €"
        )

    if draw(st.booleans()):
        parts.append(
            f"Mindestbestellwert beträgt {draw(general_text_for_numbers_st)} €"
        )

    if draw(st.booleans()):
        parts.append(f"bis zum {draw(general_text_for_numbers_st)} . Monat")

    # sprinkle some random filler
    for _ in range(draw(st.integers(min_value=0, max_value=3))):
        parts.append(draw(safe_text_st))

    random.shuffle(parts)
    return "\n".join(parts)


@st.composite
def raw_item_data_st(draw: st.DrawFn) -> Dict[str, Any]:
    """Hypothesis strategy that builds raw JSON-like dicts."""
    data: Dict[str, Any] = {
        "product": draw(st.one_of(st.text(max_size=100), st.integers(0, 10).map(str))),
        "description": draw(
            st.one_of(generate_description_fuzz(), st.integers(0, 10).map(str))
        ),
        "valid": draw(st.booleans()),
        "last": draw(st.booleans()),
    }

    # Sprinkle a couple of random extra or malformed keys
    if draw(st.integers(0, 8)) == 0:
        data[draw(st.text(min_size=1, max_size=10))] = draw(
            st.one_of(st.integers(), st.text(), st.booleans(), st.none())
        )

    # Occasionally break the type of some core fields
    if draw(st.integers(0, 20)) == 0:
        data["product"] = draw(st.one_of(st.integers(), st.booleans(), st.none()))

    if draw(st.integers(0, 20)) == 0:
        data["description"] = draw(st.one_of(st.integers(), st.booleans(), st.none()))

    if draw(st.integers(0, 10)) == 0:
        data["valid"] = draw(
            st.one_of(st.text(max_size=5), st.integers(0, 1), st.none())
        )

    return data


# --- The updated fuzz-test -------------------------------------------------- #


class TestVerbynDichFactoryFuzzing:
    """Fuzz-tests that exercise the robustness of the parser."""

    @given(raw_data=raw_item_data_st())
    @settings(
        max_examples=1_000,
        suppress_health_check=[
            HealthCheck.too_slow,
            HealthCheck.data_too_large,
            HealthCheck.filter_too_much,
        ],
        deadline=None,
    )
    def test_parse_response_fuzzing(self, raw_data: Dict[str, Any]) -> None:
        """Round-trip arbitrary (but vaguely realistic) JSON into the parser."""
        # Coerce product / description to str so that the factory at least gets
        # strings (it still might decide they are empty/invalid and return None)
        processed: Dict[str, Any] = raw_data.copy()
        processed["product"] = str(processed.get("product", ""))
        processed["description"] = str(processed.get("description", ""))

        response = VerbynDichFactory.parse_response(processed)

        # ------------------------------------------------------------------- #
        # 1)  The factory MAY decide the offer is invalid and return None.
        #     That’s totally fine – nothing more to assert.
        # ------------------------------------------------------------------- #
        if response is None:
            return

        # ------------------------------------------------------------------- #
        # 2)  If we *did* get a model back, a handful of invariants must hold.
        # ------------------------------------------------------------------- #
        assert isinstance(response, VerbynDichResponse)
        assert response.valid is True

        # Required, non-empty strings
        assert response.plan_name.strip()

        # Primitive invariants
        assert response.price_cents_month >= 0
        assert response.speed_down_mbit > 0
        assert response.contract_duration_months > 0
        assert isinstance(response.connection_type, str)
        assert isinstance(response.tv_included, bool)

        # Optional numerical fields – if present, must be ≥ 0
        optional_ints: list[Optional[int]] = [
            response.max_age,
            response.voucher_value_cents,
            response.voucher_until_month,
            response.data_cap_gb,
            response.promo_month,
            response.promo_price_cents,
            response.min_order_cents,
        ]
        for value in optional_ints:
            if value is not None:
                assert value >= 0

        # Percentage is clamped to 0–100 inside the factory
        if response.voucher_value_percent is not None:
            assert 0.0 <= response.voucher_value_percent <= 100.0

        if response.voucher_type is not None:
            assert isinstance(response.voucher_type, VoucherKind)

        if response.voucher_value_cap is not None:
            assert response.voucher_value_cap >= 0.0
