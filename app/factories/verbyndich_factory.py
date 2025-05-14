# app/providers/verbyndich_factory.py
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.models import Address
from app.models.base.offer import VoucherKind
from app.models.providers.verbyndich_request import VerbynDichRequest
from app.models.providers.verbyndich_response import VerbynDichResponse

# Pre‐compiled regexes
_PRICE_MONTH_RE = re.compile(r"für\s*nur\s*(\d+(?:[.,]\d+)?)\s*€\s*im\s*Monat", re.I)
_SPEED_RE = re.compile(r"(\d+)\s*Mbit", re.I)
_DURATION_RE = re.compile(r"Mindestvertragslaufzeit\s*(\d+)\s*Monate?", re.I)
_MAX_AGE_RE = re.compile(r"(?:unter|bis)\s*(\d+)\s*Jahr", re.I)
_VOUCHER_RE = re.compile(r"Rabatt\s+von\s*(\d+)\s*€", re.I)
_CONN_RE = re.compile(r"\b(DSL|Cable|Kabel|Fiber|Glasfaser|Mobile)\b", re.I)
_TV_PKG_RE = re.compile(r"\b([A-Z][A-Za-z0-9+]*TV\+?)\b")
_DATA_CAP_RE = re.compile(r"Ab\s*(\d+)\s*GB", re.I)


class VerbynDichFactory:
    """
    Factory for building request bodies and parsing raw page items
    into VerbynDichResponse models.
    """

    @staticmethod
    def build_body(address: Address) -> str:
        """
        Build the JSON/XML (whichever) body for the VerbynDichRequest.
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
        Parse one raw item dict into a VerbynDichResponse, or None if invalid.
        """
        desc = data.get("description", "")
        raw_product = data.get("product", "")

        def _match(rgx: re.Pattern[str]) -> Optional[str]:
            m = rgx.search(desc)
            return m.group(1) if m else None

        # price
        price_eur = _match(_PRICE_MONTH_RE)
        try:
            price_cents = (
                int(float(price_eur.replace(",", ".")) * 100) if price_eur else 0
            )
        except ValueError:
            price_cents = 0

        # speed, duration, max_age
        speed = int(_match(_SPEED_RE) or 16)
        duration = int(_match(_DURATION_RE) or 24)
        max_age = int(_match(_MAX_AGE_RE)) if _match(_MAX_AGE_RE) else None

        # voucher
        voucher_eur = _match(_VOUCHER_RE)
        voucher_value = int(voucher_eur) * 100 if voucher_eur else None
        voucher_type = VoucherKind.ABSOLUTE if voucher_value else None

        # connection type
        conn = _match(_CONN_RE)
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
        tv_pkg = _match(_TV_PKG_RE)
        tv_included = bool(tv_pkg)

        # data cap
        data_cap_str = _match(_DATA_CAP_RE)
        data_cap_gb = int(data_cap_str) if data_cap_str else None

        # plan name cleanup
        plan_name = raw_product
        if plan_name.lower().startswith("verbyndich"):
            plan_name = plan_name.split(" ", 1)[1].strip()

        return VerbynDichResponse(
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

    @staticmethod
    def parse_responses(raw_items: List[Dict[str, Any]]) -> List[VerbynDichResponse]:
        """
        Convert a list of raw dicts into VerbynDichResponse models.
        """
        responses: List[VerbynDichResponse] = []
        for item in raw_items:
            resp = VerbynDichFactory.parse_response(item)
            if resp is not None:
                responses.append(resp)
        return responses
