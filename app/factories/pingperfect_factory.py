from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from pydantic import ValidationError

from app.core import Settings
from app.models import Address
from app.models.providers.requests import PingPerfectRequest
from app.models.providers.responses import PingPerfectResponse
from app.utils import get_settings, sign
from app.utils import logger


class PingPerfectFactory:
    """
    Factory for building PingPerfect API requests and parsing responses.

    This class handles request construction and translates API responses
    into PingPerfectResponse models, focusing on transport concerns
    and computing derived fields like a deterministic UUID and normalization flags.
    """


    @staticmethod
    def build_payload(
        address: Address,
        wants_fiber: bool = False,
    ) -> Tuple[str, Dict[str, str]]:
        """
        Build the JSON payload and HTTP headers for the PingPerfect availability endpoint.

        Args:
            address (Address): The address to check availability for.
            wants_fiber (bool): Whether to request fiber availability.

        Returns:
            Tuple[str, Dict[str, str]]: JSON payload string and HTTP headers.
        """
        req = PingPerfectRequest(
            street=address.street,
            houseNumber=address.house_number,
            plz=address.plz,
            city=address.city,
            wantsFiber=wants_fiber,
        )

        # Serialize to compact JSON
        payload_json: str = json.dumps(req.model_dump(), separators=(",", ":"))
        logger.debug(f"PingPerfectFactory.build_payload → {payload_json}")

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


    @staticmethod
    def _installation_included(val: Any) -> bool:
        """
        Normalize installation service indicator to boolean.

        Args:
            val (Any): Raw installation service value.

        Returns:
            bool: True if installation is included.
        """
        return str(val).strip().lower() in {"yes", "included", "true", "1"}

    @staticmethod
    def parse_response(item: Dict[str, Any]) -> Optional[PingPerfectResponse]:
        """
        Parse a raw JSON item into a PingPerfectResponse model.

        Pre-computes a deterministic product_id and normalizes boolean fields,
        deferring full validation to the Pydantic model.

        Args:
            item (Dict[str, Any]): Raw JSON item from the API.

        Returns:
            Optional[PingPerfectResponse]: Parsed response or None if invalid.
        """
        logger.debug(f"PingPerfectFactory.parse_response → {item}")

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
                f"PingPerfectFactory.parse_response → validation error: {ve} (item={item})"
            )
        except Exception as exc:
            logger.warning(
                f"PingPerfectFactory.parse_response → unexpected error: {exc} (item={item})"
            )
        return None

    @staticmethod
    def parse_responses(raw_items: List[Dict[str, Any]]) -> List[PingPerfectResponse]:
        """
        Parse multiple JSON items into PingPerfectResponse models.

        Args:
            raw_items (List[Dict[str, Any]]): List of raw JSON items.

        Returns:
            List[PingPerfectResponse]: Successfully parsed responses.
        """
        responses: List[PingPerfectResponse] = []
        for item in raw_items:
            resp = PingPerfectFactory.parse_response(item)
            if resp is not None:
                responses.append(resp)
            else:
                logger.debug(f"PingPerfectFactory → skipped invalid item {item}")
        return responses
