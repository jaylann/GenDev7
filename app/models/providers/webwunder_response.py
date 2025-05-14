import xml.etree.ElementTree as ET
from typing import Optional

from pydantic import BaseModel

from app.models.base.offer import VoucherKind, Offer


class WebWunderProduct(BaseModel):
    provider_name: str
    product_id: str
    speed_down_mbit: int
    price_cents_month_intro: int
    price_cents_month_regular: int
    contract_duration_months: int
    connection_type: str
    voucher_type: Optional[VoucherKind]
    voucher_value_cents: Optional[int]
    voucher_min_order_value_cents: Optional[int]

    @classmethod
    def from_element(cls, elem: ET.Element) -> "WebWunderProduct":
        def txt(tag: str, default: str = "") -> str:
            found = elem.find(f".//{{*}}{tag}")
            return found.text.strip() if found is not None and found.text else default

        speed = int(txt("speed", "0"))
        price_intro = int(txt("monthlyCostInCent", "0"))
        price_regular = int(txt("monthlyCostInCentFrom25thMonth", "0"))
        contract_term = int(txt("contractDurationInMonths", "0"))
        connection = txt("connectionType", "DSL")

        voucher_elem = elem.find(".//{*}voucher")
        voucher_type = None
        voucher_value = None
        voucher_min_order_value = None
        if voucher_elem is not None:
            raw_type = voucher_elem.attrib.get(
                "{http://www.w3.org/2001/XMLSchema-instance}type"
            )
            if raw_type and raw_type.lower().endswith("absolutevoucher"):
                voucher_type = VoucherKind.ABSOLUTE
                voucher_value = int(txt("discountInCent", "0"))
                voucher_min_order_value = int(txt("minOrderValueInCent", "0"))

        return cls(
            provider_name=txt("providerName"),
            product_id=txt("productId"),
            speed_down_mbit=speed,
            price_cents_month_intro=price_intro,
            price_cents_month_regular=price_regular,
            contract_duration_months=contract_term,
            connection_type=connection,
            voucher_type=voucher_type,
            voucher_value_cents=voucher_value,
            voucher_min_order_value_cents=voucher_min_order_value,
        )

    def to_offer(self, provider_name: str) -> Offer:
        return Offer(
            provider=provider_name,
            plan_name=self.provider_name,
            product_id=self.product_id,
            speed_down_mbit=self.speed_down_mbit,
            speed_up_mbit=None,
            data_cap_gb=None,
            connection_type=self.connection_type,
            price_cents_month_intro=self.price_cents_month_intro,
            price_cents_month_regular=self.price_cents_month_regular,
            contract_duration_months=self.contract_duration_months,
            installation_service_included=True,
            installation_cost_cents=None,
            tv_included=False,
            tv_package_name=None,
            voucher_type=self.voucher_type,
            voucher_value_cents=self.voucher_value_cents,
            voucher_min_order_value_cents=self.voucher_min_order_value_cents,
            voucher_value_percent=None,
            max_age=None,
        )
