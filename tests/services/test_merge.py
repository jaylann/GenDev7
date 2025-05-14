import math

import pytest
from pydantic import ValidationError

from app.models.base.offer import VoucherKind, Offer
from app.services.merge import _key, _effective_price, merge_offers


def make_offer(
    provider: str = "Prov",
    product_id: str = "ID",
    price_cents_month_intro: int | None = None,
    price_cents_month_regular: int | None = None,
    connection_type: str | None = None,
    tv_included: bool | None = None,
    tv_package_name: str | None = None,
    voucher_type: VoucherKind | None = None,
    voucher_value_cents: int | None = None,
    voucher_value_percent: float | None = None,
) -> Offer:
    """
    Helper to construct an Offer with required fields and optional arguments.
    """
    data = {
        "provider": provider,
        "plan_name": "TestPlan",
        "product_id": product_id,
        "installation_service_included": True,
        "tv_included": tv_included,
        "tv_package_name": tv_package_name,
        "price_cents_month_intro": price_cents_month_intro,
        "price_cents_month_regular": price_cents_month_regular,
        "connection_type": connection_type,
        "voucher_type": voucher_type,
        "voucher_value_cents": voucher_value_cents,
        "voucher_value_percent": voucher_value_percent,
    }
    # Include tv_included even if None so validator can derive, filter out other None
    filtered = {k: v for k, v in data.items() if v is not None or k == "tv_included"}
    return Offer(**filtered)


class TestKeyFunction:

    @pytest.mark.parametrize(
        "provider,product_id,expected",
        [
            ("Prov", "ID", ("prov", "id")),
            ("PROVider", "Prod-123", ("provider", "prod-123")),
            ("Test", "TeSt", ("test", "test")),
        ],
    )
    def test_key_normalizes_to_lower(
        self, provider: str, product_id: str, expected: tuple[str, str]
    ):
        offer = make_offer(provider=provider, product_id=product_id)
        assert _key(offer) == expected


class TestEffectivePriceFunction:

    def test_prefers_intro_price(self):
        offer = make_offer(price_cents_month_intro=500, price_cents_month_regular=800)
        assert _effective_price(offer) == 500

    def test_uses_regular_when_intro_missing(self):
        offer = make_offer(price_cents_month_intro=None, price_cents_month_regular=800)
        assert _effective_price(offer) == 800

    def test_returns_inf_when_both_missing(self):
        offer = make_offer(price_cents_month_intro=None, price_cents_month_regular=None)
        assert _effective_price(offer) == math.inf


class TestMergeOffers:

    def test_merges_and_sorts_offers(self):
        o1 = make_offer(provider="A", product_id="1", price_cents_month_intro=300)
        o2 = make_offer(provider="A", product_id="1", price_cents_month_intro=200)
        o3 = make_offer(provider="B", product_id="2", price_cents_month_regular=150)
        o4 = make_offer(provider="C", product_id="3")  # unknown price
        merged = merge_offers([o1, o2, o3, o4])

        assert merged[0] is o3
        assert merged[1] is o2
        assert merged[2] is o4
        assert len(merged) == 3

    def test_keeps_existing_if_price_not_lower(self):
        o1 = make_offer(provider="X", product_id="Y", price_cents_month_intro=400)
        o2 = make_offer(provider="X", product_id="Y", price_cents_month_intro=600)
        merged = merge_offers([o1, o2])
        assert merged == [o1]


class TestOfferModelValidators:

    @pytest.mark.parametrize(
        "input_val,expected",
        [
            ("dsl", "DSL"),
            ("CaBlE", "Cable"),
            ("fiber", "Fiber"),
            ("mobile", "Mobile"),
            (None, None),
        ],
    )
    def test_connection_type_normalization(
        self, input_val: str | None, expected: str | None
    ):
        offer = make_offer(connection_type=input_val)
        assert offer.connection_type == expected

    def test_connection_type_unknown_raises(self):
        with pytest.raises(ValidationError):
            make_offer(connection_type="unknown")

    def test_tv_included_derived_from_package(self):
        offer = make_offer(tv_included=None, tv_package_name="MyPack")
        assert offer.tv_included is True

        offer2 = make_offer(tv_included=False, tv_package_name=None)
        assert offer2.tv_included is False

        offer3 = make_offer(tv_included=True, tv_package_name=None)
        assert offer3.tv_included is True

    def test_voucher_value_percent_requires_correct_type(self):
        offer = make_offer(
            voucher_type=VoucherKind.PERCENTAGE, voucher_value_percent=10.0
        )
        assert offer.voucher_value_percent == 10.0

        offer2 = make_offer(
            voucher_type=VoucherKind.DISCOUNT, voucher_value_percent=5.5
        )
        assert offer2.voucher_value_percent == 5.5

        with pytest.raises(ValidationError):
            make_offer(voucher_type=VoucherKind.ABSOLUTE, voucher_value_percent=20.0)

        with pytest.raises(ValidationError):
            make_offer(voucher_value_percent=15.0)
