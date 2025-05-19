"""
Utilities for building request bodies and parsing responses from the VerbynDich provider.

Constructs API payloads and transforms raw provider data into validated
VerbynDichResponse models, filtering out invalid or duplicate offers.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from app.models import Address
from app.models.base.offer import VoucherKind
from app.models.providers.requests import VerbynDichRequest
from app.models.providers.responses import VerbynDichResponse
from app.utils import logger

# Regex patterns for field extraction
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
    Factory for integrating with the VerbynDich provider.

    Builds API request payloads and parses raw provider data into
    VerbynDichResponse models, filtering out invalid offers and removing duplicates.
    """

    @staticmethod
    def build_body(address: Address) -> str:
        """
        Build the request payload for VerbynDich.

        Args:
            address (Address): Customer address.

        Returns:
            str: JSON payload for the API request.
        """
        req = VerbynDichRequest(
            street=address.street,
            house_number=address.house_number,
            city=address.city,
            plz=address.plz,
        )
        return req.to_body()

    @staticmethod
    def parse_response(data: Dict[str, Any]) -> Optional[VerbynDichResponse]:
        """
        Parses raw provider data into a VerbynDichResponse model.

        Extracts pricing, speed, contract duration, promotions, and other
        relevant fields. Invalid or unavailable offers yield None.

        Args:
            data (Dict[str, Any]): Raw response dictionary from the provider.

        Returns:
            Optional[VerbynDichResponse]: Parsed response object or None if invalid.
        """
        logger.info(f"VerbynDichFactory.parse_response: {data}")
        if not data.get("valid", False):
            return None

        try:
            desc = data.get("description", "")
            raw_product = data.get("product", "")

            def _match_first(pattern: re.Pattern[str]) -> Optional[str]:
                m = pattern.search(desc)
                return m.group(1) if m else None

            # Determine monthly price in cents
            price_cents = 0
            if m := _match_first(_PRICE_MONTH_RE):
                try:
                    price_cents = int(float(m.replace(",", ".")) * 100)
                except ValueError:
                    pass

            # Default core field values for coercion
            speed_down = _match_first(_SPEED_RE) or "16"
            contract_duration_months = _match_first(_DURATION_RE) or "24"
            max_age = _match_first(_MAX_AGE_RE)

            # Determine voucher details
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

            # Normalize connection type
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

            # Extract TV package names
            tv_pkgs = _TV_PKG_RE.findall(desc)
            tv_package_name = ", ".join(dict.fromkeys(tv_pkgs)) if tv_pkgs else None
            tv_included = bool(tv_pkgs)

            # Extract data cap in GB
            data_cap_gb = _match_first(_DATA_CAP_RE)

            # Determine promotional price
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

            # Determine minimum order value
            min_order_cents = None
            if mo := _match_first(_MIN_ORDER_RE):
                try:
                    min_order_cents = int(mo) * 100
                except ValueError:
                    pass

            # Simplify plan name
            plan_name = raw_product
            if plan_name.lower().startswith("verbyndich"):
                parts = plan_name.split(" ", 1)
                if len(parts) > 1:
                    plan_name = parts[1].strip()

            # Build Pydantic model (invalid data yields None)
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
        """
        Parse multiple raw provider response dictionaries into VerbynDichResponse models.

        Iterates over raw_items, parsing each entry and filtering out duplicates
        based on product and price. Invalid entries are skipped.

        Args:
            raw_items (List[Dict[str, Any]]): Raw response data from the provider.

        Returns:
            List[VerbynDichResponse]: List of unique, parsed provider responses.
        """
        responses: List[VerbynDichResponse] = []
        seen = set()
        for item in raw_items:
            if resp := VerbynDichFactory.parse_response(item):
                key = (resp.product, resp.price_cents_month)
                if key not in seen:
                    seen.add(key)
                    responses.append(resp)
        return responses
