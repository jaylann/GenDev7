# app/providers/pingperfect_factory.py
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from loguru import logger

from app.core.config import get_settings
from app.models import Address
from app.models.providers.ping_perfect_request import PingPerfectRequest
from app.models.providers.pingperfect_response import PingPerfectResponse
from app.utils.hmac_sign import sign

settings = get_settings()


class PingPerfectFactory:
    """
    Factory to build PingPerfect API requests and parse responses into PingPerfectResponse models.
    """

    @staticmethod
    def build_payload(address: Address) -> Tuple[str, Dict[str, str]]:
        """
        Build the JSON payload and HTTP headers for a PingPerfect availability request.
        """
        req = PingPerfectRequest(
            street=address.street,
            houseNumber=address.house_number,
            plz=address.plz,
            city=address.city,
        )
        payload_dict = req.model_dump(by_alias=True)
        payload_json = json.dumps(payload_dict, separators=(",", ":"))
        logger.debug(f"PingPerfectFactory.build_payload → {payload_json}")

        ts = str(int(time.time()))
        signature = sign(req, ts, settings.pingperfect_secret)

        headers = {
            "X-Client-Id": settings.pingperfect_client_id,
            "X-Timestamp": ts,
            "X-Signature": signature,
            "Content-Type": "application/json",
        }
        return payload_json, headers

    @staticmethod
    def parse_response(item: Dict[str, Any]) -> Optional[PingPerfectResponse]:
        """
        Parse a single JSON item into a PingPerfectResponse, or return None if invalid.
        """
        info = item.get("productInfo")
        price = item.get("pricingDetails")
        if info is None or price is None:
            return None

        provider_name = item.get("providerName", "")
        speed_val = info.get("speed")
        term_val = info.get("contractDurationInMonths")
        product_uuid = uuid.uuid5(
            uuid.NAMESPACE_DNS,
            f"{provider_name}-{speed_val}-{term_val}",
        ).hex

        installation_raw = str(price.get("installationService", "")).strip().lower()
        installation_included = installation_raw in {"yes", "included", "true"}

        return PingPerfectResponse(
            provider_name=provider_name,
            product_id=product_uuid,
            speed_down_mbit=int(speed_val) if speed_val is not None else None,
            connection_type=info.get("connectionType"),
            data_cap_gb=(
                int(info.get("limitFrom"))
                if info.get("limitFrom") is not None
                else None
            ),
            price_cents_month=(
                int(price.get("monthlyCostInCent"))
                if price.get("monthlyCostInCent")
                else None
            ),
            contract_duration_months=int(term_val) if term_val is not None else None,
            installation_service_included=installation_included,
            tv_included=bool(info.get("tv")),
            tv_package_name=info.get("tv"),
            voucher_type=None,
            voucher_value_cents=None,
            max_age=int(info.get("maxAge")) if info.get("maxAge") is not None else None,
        )

    @staticmethod
    def parse_responses(raw_items: List[Dict[str, Any]]) -> List[PingPerfectResponse]:
        """
        Transform a list of raw JSON items into PingPerfectResponse models.
        """
        responses: List[PingPerfectResponse] = []
        for item in raw_items:
            resp = PingPerfectFactory.parse_response(item)
            if resp:
                responses.append(resp)
            else:
                logger.warning("PingPerfectFactory → skipped invalid item %r", item)
        return responses
