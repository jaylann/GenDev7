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
