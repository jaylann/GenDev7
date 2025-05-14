import pytest
from pydantic import ValidationError

from app.models import Offer
from app.models.base.offer import VoucherKind

# Base valid payload for reuse
BASE_VALID = {
    "provider": "ByteMe",
    "plan_name": "Ultra 70",
    "product_id": "501",
    # required boolean fields
    "tv_included": True,
    "installation_service_included": False,
}


class TestConnectionTypeNormalization:
    @pytest.mark.parametrize(
        "input_val,expected",
        [
            (None, None),
            ("dsl", "DSL"),
            ("Cable", "Cable"),
            ("fibEr", "Fiber"),
            ("MOBILE", "Mobile"),
        ],
    )
    def test_normalize_known(self, input_val, expected):
        data = {**BASE_VALID, "connection_type": input_val}
        offer = Offer(**data)
        assert offer.connection_type == expected

    def test_unknown_raises(self):
        data = {**BASE_VALID, "connection_type": "unknown"}
        with pytest.raises(ValidationError) as exc:
            Offer(**data)
        assert "Input should be" in str(exc.value)


class TestVoucherValuePercentValidator:
    def test_valid_percentage(self):
        data = {
            **BASE_VALID,
            "voucher_type": VoucherKind.PERCENTAGE,
            "voucher_value_percent": 15.5,
        }
        offer = Offer(**data)
        assert offer.voucher_value_percent == 15.5
        assert offer.voucher_type == VoucherKind.PERCENTAGE

    def test_valid_discount(self):
        data = {
            **BASE_VALID,
            "voucher_type": VoucherKind.DISCOUNT,
            "voucher_value_percent": 20,
        }
        offer = Offer(**data)
        assert offer.voucher_value_percent == 20
        assert offer.voucher_type == VoucherKind.DISCOUNT

    @pytest.mark.parametrize("vt", [None, VoucherKind.ABSOLUTE, VoucherKind.CASHBACK])
    def test_percent_without_valid_type_raises(self, vt):
        data = {**BASE_VALID, "voucher_type": vt, "voucher_value_percent": 10}
        with pytest.raises(ValidationError) as exc:
            Offer(**data)
        assert "voucher_value_percent set but voucher_type" in str(exc.value)

    def test_no_percent_ok(self):
        data = {**BASE_VALID, "voucher_type": VoucherKind.ABSOLUTE}
        offer = Offer(**data)
        assert offer.voucher_value_percent is None


class TestTvIncludedDerivation:
    def test_explicit_true_overrides(self):
        data = {**BASE_VALID, "tv_included": True, "tv_package_name": None}
        offer = Offer(**data)
        assert offer.tv_included is True

    def test_explicit_false_overrides(self):
        data = {**BASE_VALID, "tv_included": False, "tv_package_name": "Some Package"}
        offer = Offer(**data)
        assert offer.tv_included is False

    def test_derive_true_when_package(self):
        data = {**BASE_VALID, "tv_included": None, "tv_package_name": "Premium TV"}
        offer = Offer(**data)
        assert offer.tv_included is True

    def test_derive_false_when_no_package(self):
        data = {**BASE_VALID, "tv_included": None, "tv_package_name": None}
        offer = Offer(**data)
        assert offer.tv_included is False


class TestPositiveIntValidators:
    @pytest.mark.parametrize(
        "field, value",
        [
            ("speed_down_mbit", 0),
            ("speed_up_mbit", -5),
            ("price_cents_month_intro", 0),
            ("price_cents_month_regular", -100),
            ("installation_cost_cents", 0),
            ("contract_duration_months", 0),
        ],
    )
    def test_positive_int_fields_invalid(self, field, value):
        data = {**BASE_VALID, field: value}
        with pytest.raises(ValidationError) as exc:
            Offer(**data)
        assert "Input should be greater than 0" in str(exc.value)


class TestRequiredFields:
    @pytest.mark.parametrize(
        "missing_field",
        [
            "provider",
            "plan_name",
            "product_id",
            "tv_included",
            "installation_service_included",
        ],
    )
    def test_missing_required_fields(self, missing_field):
        data = BASE_VALID.copy()
        data.pop(missing_field, None)
        with pytest.raises(ValidationError) as exc:
            Offer(**data)
        assert "Field required" in str(exc.value)


class TestExtraFieldsIgnored:
    def test_extra_field_ignored(self):
        data = {**BASE_VALID, "extra": "value"}
        offer = Offer(**data)
        assert not hasattr(offer, "extra")


class TestDataCapGbAllowsNegative:
    def test_negative_data_cap(self):
        data = {**BASE_VALID, "data_cap_gb": -100}
        offer = Offer(**data)
        assert offer.data_cap_gb == -100
