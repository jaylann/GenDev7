from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from pydantic import ValidationError
from app.models import Address
from app.models.base.offer import VoucherKind
from app.models.providers.verbyndich_request import VerbynDichRequest
from app.models.providers.verbyndich_response import VerbynDichResponse
from app.utils.logger import logger

# Pre-compiled regexes for extraction
_PRICE_MONTH_RE = re.compile(r"für\s*nur\s*(\d+(?:[.,]\d+)?)\s*€\s*im\s*Monat", re.I)
_SPEED_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*Mbit", re.I)
_DURATION_RE = re.compile(r"Mindestvertragslaufzeit\s*(\d+)\s*Monat", re.I)
_MAX_AGE_RE = re.compile(r"(?:unter|bis)\s*(\d+)\s*Jahr", re.I)
_VOUCHER_EUR_RE = re.compile(r"Rabatt\s+von\s*(\d+(?:[.,]\d+)?)\s*€", re.I)
_VOUCHER_PERC_RE = re.compile(r"Rabatt\s+von\s*(\d+(?:[.,]\d+)?)\s*%", re.I)
_VOUCHER_CAP_RE = re.compile(
    r"maximal(?:e|er)? Rabatt beträgt\s*(\d+(?:[.,]\d+)?)\s*€", re.I
)
_VOUCHER_UNTIL_RE = re.compile(r"bis zum\s*(\d+)\s*\.?\s*Monat", re.I)
_CONN_RE = re.compile(r"\b(DSL|Cable|Kabel|Fiber|Glasfaser|Mobile)\b", re.I)
_TV_PKG_RE = re.compile(r"\b([A-Z][A-Za-z0-9]*TV\+?)(?=\W|$)")
_DATA_CAP_RE = re.compile(r"Ab\s*(\d+)\s*GB", re.I)
_PROMO_PRICE_RE = re.compile(
    r"Ab\s*dem\s*(\d+)\.?\s*Monat[\s\S]*?monatliche\s*Preis\s*(\d+(?:[.,]\d+)?)\s*€",
    re.I,
)
_MIN_ORDER_RE = re.compile(r"Mindestbestellwert\s*beträgt\s*(\d+)\s*€", re.I)


class VerbynDichFactory:
    """
    Factory for building request bodies and parsing raw page items
    into VerbynDichResponse models, deduplicating and enriching
    extracted values where possible.
    Invalid or unavailable offers are filtered out.
    """

    @staticmethod
    def build_body(address: Address) -> str:
        req = VerbynDichRequest(
            street=address.street,
            house_number=address.house_number,
            city=address.city,
            plz=address.plz,
        )
        return req.to_body()

    @staticmethod
    def parse_response(data: Dict[str, Any]) -> Optional[VerbynDichResponse]:
        logger.info(f"VerbynDichFactory.parse_response: {data}")
        if not data.get("valid", False):
            return None

        try:
            desc = data.get("description", "")
            raw_product = data.get("product", "")

            def _match_first(pattern: re.Pattern[str]) -> Optional[str]:
                m = pattern.search(desc)
                return m.group(1) if m else None

            # price (in cents)
            price_cents = 0
            if m := _match_first(_PRICE_MONTH_RE):
                try:
                    price_cents = int(float(m.replace(",", ".")) * 100)
                except ValueError:
                    pass

            # core numeric fields as strings (Pydantic will coerce/validate)
            speed_down = _match_first(_SPEED_RE) or "16"
            contract_duration_months = _match_first(_DURATION_RE) or "24"
            max_age = _match_first(_MAX_AGE_RE)

            # voucher
            voucher_type = None
            voucher_value_percent = None
            voucher_value_cap = None
            voucher_value_cents = None

            if perc := _match_first(_VOUCHER_PERC_RE):
                try:
                    pct = float(perc.replace(",", "."))
                except ValueError:
                    pct = 0.0
                if pct > 0:
                    voucher_type = VoucherKind.PERCENTAGE
                    voucher_value_percent = min(pct, 100.0)
                    if cap := _match_first(_VOUCHER_CAP_RE):
                        try:
                            voucher_value_cap = int(float(cap.replace(",", ".")) * 100)
                        except ValueError:
                            pass
            elif eur := _match_first(_VOUCHER_EUR_RE):
                try:
                    voucher_type = VoucherKind.ABSOLUTE
                    voucher_value_cents = int(float(eur.replace(",", ".")) * 100)
                except ValueError:
                    pass

            voucher_until_month = _match_first(_VOUCHER_UNTIL_RE)

            # connection
            conn = _match_first(_CONN_RE)
            conn_map = {
                "dsl": "DSL",
                "cable": "Cable",
                "kabel": "Cable",
                "fiber": "Fiber",
                "glasfaser": "Fiber",
                "mobile": "Mobile",
            }
            connection_type = conn_map.get(conn.lower(), "DSL") if conn else "DSL"

            # TV
            tv_pkgs = _TV_PKG_RE.findall(desc)
            tv_package_name = ", ".join(dict.fromkeys(tv_pkgs)) if tv_pkgs else None
            tv_included = bool(tv_pkgs)

            # data cap
            data_cap_gb = _match_first(_DATA_CAP_RE)

            # promo price
            promo_month = None
            promo_price_cents = None
            if promo := _PROMO_PRICE_RE.search(desc):
                promo_month = promo.group(1)
                try:
                    promo_price_cents = int(
                        float(promo.group(2).replace(",", ".")) * 100
                    )
                except ValueError:
                    pass

            # minimum order
            min_order_cents = None
            if mo := _match_first(_MIN_ORDER_RE):
                try:
                    min_order_cents = int(mo) * 100
                except ValueError:
                    pass

            # clean plan name
            plan_name = raw_product
            if plan_name.lower().startswith("verbyndich"):
                parts = plan_name.split(" ", 1)
                if len(parts) > 1:
                    plan_name = parts[1].strip()

            # try building the Pydantic model – any validation error becomes None
            return VerbynDichResponse(
                valid=True,
                last=data.get("last", False),
                price_cents_month=price_cents,
                speed_down_mbit=speed_down,
                contract_duration_months=contract_duration_months,
                max_age=max_age,
                voucher_type=voucher_type,
                voucher_value_cents=voucher_value_cents,
                voucher_value_percent=voucher_value_percent,
                voucher_value_cap=voucher_value_cap,
                voucher_until_month=voucher_until_month,
                connection_type=connection_type,
                tv_package_name=tv_package_name,
                tv_included=tv_included,
                data_cap_gb=data_cap_gb,
                promo_month=promo_month,
                promo_price_cents=promo_price_cents,
                min_order_cents=min_order_cents,
                plan_name=plan_name,
            )
        except (ValidationError, Exception) as e:
            logger.warning(
                f"VerbynDichFactory.parse_response exception: {e}", exc_info=True
            )
            return None

    @staticmethod
    def parse_responses(raw_items: List[Dict[str, Any]]) -> List[VerbynDichResponse]:
        responses: List[VerbynDichResponse] = []
        seen = set()
        for item in raw_items:
            if resp := VerbynDichFactory.parse_response(item):
                key = (resp.product, resp.price_cents_month)
                if key not in seen:
                    seen.add(key)
                    responses.append(resp)
        return responses
