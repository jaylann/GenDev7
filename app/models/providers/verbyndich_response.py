from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel

from app.models.base.offer import VoucherKind, Offer

# --------------------------------------------------------------------------- #
# Regex helpers (pre-compiled once at import time)
# --------------------------------------------------------------------------- #
PRICE_MONTH_RE = re.compile(r"für\s*nur\s*(\d+(?:[.,]\d+)?)\s*€\s*im\s*Monat", re.I)
SPEED_RE = re.compile(r"(\d+)\s*Mbit", re.I)
DURATION_RE = re.compile(r"Mindestvertragslaufzeit\s*(\d+)\s*Monate?", re.I)
MAX_AGE_RE = re.compile(r"(?:unter|bis)\s*(\d+)\s*Jahr", re.I)
VOUCHER_RE = re.compile(r"Rabatt\s+von\s*(\d+)\s*€", re.I)
CONN_RE = re.compile(r"\b(DSL|Cable|Kabel|Fiber|Glasfaser|Mobile)\b", re.I)
TV_PKG_RE = re.compile(r"\b([A-Z][A-Za-z0-9+]*TV\+?)\b")
DATA_CAP_RE = re.compile(r"Ab\s*(\d+)\s*GB", re.I)


class VerbynDichResponse(BaseModel):
    description: str
    product: str
    valid: bool
    last: bool
    price_cents_month: int
    speed_down_mbit: int
    contract_duration_months: int
    max_age: Optional[int]
    voucher_type: Optional[VoucherKind]
    voucher_value_cents: Optional[int]
    connection_type: str
    tv_package_name: Optional[str]
    tv_included: bool
    data_cap_gb: Optional[int]
    plan_name: str

    @classmethod
    def from_dict(cls, data: dict) -> "VerbynDichResponse":
        desc = data.get("description", "")
        raw_product = data.get("product", "")

        def _match_rgx(rgx: re.Pattern[str]) -> Optional[str]:
            m = rgx.search(desc)
            return m.group(1) if m else None

        # parse numeric and enumerated fields
        price_eur = _match_rgx(PRICE_MONTH_RE)
        price_cents = int(float(price_eur.replace(",", ".")) * 100) if price_eur else 0
        speed = int(_match_rgx(SPEED_RE) or 16)
        duration = int(_match_rgx(DURATION_RE) or 24)
        max_age = int(_match_rgx(MAX_AGE_RE)) if _match_rgx(MAX_AGE_RE) else None
        voucher_eur = _match_rgx(VOUCHER_RE)
        voucher_value = int(voucher_eur) * 100 if voucher_eur else None
        voucher_type = VoucherKind.ABSOLUTE if voucher_value else None
        conn = _match_rgx(CONN_RE)
        conn_map = {
            "dsl": "DSL",
            "cable": "Cable",
            "kabel": "Cable",
            "fiber": "Fiber",
            "glasfaser": "Fiber",
            "mobile": "Mobile",
        }
        connection_type = conn_map.get(conn.lower(), "DSL") if conn else "DSL"
        tv_pkg = _match_rgx(TV_PKG_RE)
        tv_included = bool(tv_pkg)
        data_cap_str = _match_rgx(DATA_CAP_RE)
        data_cap_gb = int(data_cap_str) if data_cap_str else None
        plan_name = raw_product
        if plan_name.lower().startswith("verbyndich"):
            plan_name = plan_name.split(" ", 1)[1].strip()

        return cls(
            description=desc,
            product=raw_product,
            valid=data.get("valid", False),
            last=data.get("last", False),
            price_cents_month=price_cents,
            speed_down_mbit=speed,
            contract_duration_months=duration,
            max_age=max_age,
            voucher_type=voucher_type,
            voucher_value_cents=voucher_value,
            connection_type=connection_type,
            tv_package_name=tv_pkg,
            tv_included=tv_included,
            data_cap_gb=data_cap_gb,
            plan_name=plan_name,
        )

    def to_offer(self, provider_name: str) -> Offer:
        return Offer(
            provider=provider_name,
            plan_name=self.plan_name,
            product_id=self.product,
            speed_down_mbit=self.speed_down_mbit,
            connection_type=self.connection_type,
            price_cents_month_intro=self.price_cents_month,
            price_cents_month_regular=self.price_cents_month,
            contract_duration_months=self.contract_duration_months,
            installation_service_included=False,
            installation_cost_cents=None,
            tv_included=self.tv_included,
            tv_package_name=self.tv_package_name,
            data_cap_gb=self.data_cap_gb,
            voucher_type=self.voucher_type,
            voucher_value_cents=self.voucher_value_cents,
            max_age=self.max_age,
        )
