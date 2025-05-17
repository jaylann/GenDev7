from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from loguru import logger
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.models import Address
from app.models.providers.ping_perfect_request import PingPerfectRequest
from app.models.providers.pingperfect_response import PingPerfectResponse
from app.utils.hmac_sign import sign


class PingPerfectFactory:
    """
    Build PingPerfect API requests and translate responses into
    :class:`PingPerfectResponse` models.

    All value-checking and coercion now lives in the Pydantic model,
    so this class only deals with transport concerns and a handful
    of derived fields (UUID, installation-included flag, …).
    """

    # --------------------------------------------------------------------- #
    # Outbound request helpers
    # --------------------------------------------------------------------- #

    @staticmethod
    def build_payload(
            address: Address,
            wants_fiber: bool = False,
    ) -> Tuple[str, Dict[str, str]]:
        """
        Return ``(json_payload, headers)`` for the PingPerfect availability endpoint.
        """
        req = PingPerfectRequest(
            street=address.street,
            houseNumber=address.house_number,
            plz=address.plz,
            city=address.city,
            wantsFiber=wants_fiber,
        )

        payload_json: str = req.model_dump_json(separators=(",", ":"))
        logger.debug("PingPerfectFactory.build_payload → %s", payload_json)

        ts = str(int(time.time()))
        settings: Settings = get_settings()
        signature = sign(req, ts, settings.pingperfect_secret)

        headers: Dict[str, str] = {
            "X-Client-Id": settings.pingperfect_client_id,
            "X-Timestamp": ts,
            "X-Signature": signature,
            "Content-Type": "application/json",
        }
        return payload_json, headers

    # --------------------------------------------------------------------- #
    # Inbound response helpers
    # --------------------------------------------------------------------- #

    @staticmethod
    def _installation_included(val: Any) -> bool:
        """
        Normalise vendor strings like ``"Yes"`` / ``"included"`` → ``True``.
        """
        return str(val).strip().lower() in {"yes", "included", "true", "1"}

    @staticmethod
    def parse_response(item: Dict[str, Any]) -> Optional[PingPerfectResponse]:
        """
        Convert a single JSON item to a :class:`PingPerfectResponse`.

        Let the Pydantic model decide what’s valid; we only pre-compute the
        deterministic ``product_id`` and simplify a few booleans.
        """
        logger.debug("PingPerfectFactory.parse_response → %s", item)

        try:
            info: Dict[str, Any] = item.get("productInfo", {}) or {}
            price: Dict[str, Any] = item.get("pricingDetails", {}) or {}

            provider_name = item.get("providerName")
            speed = info.get("speed")
            term = info.get("contractDurationInMonths")

            product_uuid = uuid.uuid5(
                uuid.NAMESPACE_DNS,
                f"{provider_name}-{speed}-{term}",
            ).hex

            response = PingPerfectResponse(
                provider_name=provider_name,
                product_id=product_uuid,
                speed_down_mbit=info.get("speed"),
                connection_type=info.get("connectionType"),
                data_cap_gb=info.get("limitFrom"),
                price_cents_month=price.get("monthlyCostInCent"),
                contract_duration_months=term,
                installation_service_included=PingPerfectFactory._installation_included(
                    price.get("installationService")
                ),
                tv_included=bool(info.get("tv")),
                tv_package_name=info.get("tv"),
                voucher_type=None,
                voucher_value_cents=None,
                max_age=info.get("maxAge"),
            )
            return response

        except ValidationError as ve:
            logger.warning(
                "PingPerfectFactory.parse_response → validation error: %s (item=%s)",
                ve,
                item,
            )
        except Exception as exc:
            logger.warning(
                "PingPerfectFactory.parse_response → unexpected error: %s (item=%s)",
                exc,
                item,
            )
        return None

    @staticmethod
    def parse_responses(raw_items: List[Dict[str, Any]]) -> List[PingPerfectResponse]:
        """
        Transform a list of raw JSON items into validated ``PingPerfectResponse``s,
        skipping anything that fails model validation.
        """
        responses: List[PingPerfectResponse] = []
        for item in raw_items:
            resp = PingPerfectFactory.parse_response(item)
            if resp is not None:
                responses.append(resp)
            else:
                logger.debug("PingPerfectFactory → skipped invalid item %s", item)
        return responses
