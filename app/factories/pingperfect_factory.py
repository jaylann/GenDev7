# app/providers/pingperfect_factory.py
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from loguru import logger

from app.core.config import get_settings, Settings
from app.models import Address
from app.models.providers.ping_perfect_request import PingPerfectRequest
from app.models.providers.pingperfect_response import PingPerfectResponse
from app.utils.hmac_sign import sign

settings: Settings = get_settings()


class PingPerfectFactory:
    """
    Factory to build PingPerfect API requests and parse responses into PingPerfectResponse models.
    """

    @staticmethod
    def build_payload(address: Address, wants_fiber: bool = False) -> Tuple[str, Dict[str, str]]:
        """
        Build the JSON payload and HTTP headers for a PingPerfect availability request.
        """
        req: PingPerfectRequest = PingPerfectRequest(
            street=address.street,
            houseNumber=address.house_number,
            plz=address.plz,
            city=address.city,
            wantsFiber=wants_fiber,
        )
        payload_dict: Dict[str, Any] = req.model_dump(by_alias=True)
        payload_json: str = json.dumps(payload_dict, separators=(",", ":"))
        logger.debug(f"PingPerfectFactory.build_payload → {payload_json}")

        ts: str = str(int(time.time()))
        signature: str = sign(req, ts, settings.pingperfect_secret)

        headers: Dict[str, str] = {
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
        logger.info(f"PingPerfectFactory.parse_response → {item}")
        info: Optional[Dict[str, Any]] = item.get("productInfo")
        price: Optional[Dict[str, Any]] = item.get("pricingDetails")
        if info is None or price is None:
            return None

        provider_name: str = item.get("providerName", "")
        speed_val: Any = info.get("speed")
        term_val: Any = info.get("contractDurationInMonths")
        product_uuid: str = uuid.uuid5(
            uuid.NAMESPACE_DNS,
            f"{provider_name}-{speed_val}-{term_val}",
        ).hex

        installation_raw: str = str(price.get("installationService", "")).strip().lower()
        installation_included: bool = installation_raw in {"yes", "included", "true"}

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
            resp: Optional[PingPerfectResponse] = PingPerfectFactory.parse_response(item)
            if resp:
                responses.append(resp)
            else:
                logger.warning(f"PingPerfectFactory → skipped invalid item {item}")
        return responses
