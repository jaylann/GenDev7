# app/providers/pingperfect.py
from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Dict
from typing import List

from loguru import logger
from pydantic import BaseModel, Field, ConfigDict

from app.utils.hmac_sign import sign
from .base import ProviderBase, ProviderError
from ..models import Address, Offer

PP_ENDPOINT = os.getenv("PINGPERFECT_ENDPOINT")
PP_CLIENT_ID = os.getenv("PINGPERFECT_CLIENT_ID", "REPLACE_ME")
PP_SECRET = os.getenv("PINGPERFECT_SECRET", "REPLACE_ME")


class PingPerfectRequest(BaseModel):
    """
    Typed model for the Ping Perfect API request payload.
    """

    street: str
    houseNumber: str = Field()
    plz: str
    city: str
    wantsFiber: bool = Field(default=False)

    # allow initialization with either snake_case or the JSON-style alias
    model_config = ConfigDict(populate_by_name=True)


class PingPerfectProvider(ProviderBase):
    name = "Ping Perfect"

    async def fetch(self, address: Address) -> List[Offer]:
        logger.info(f"PingPerfectProvider.fetch – address={address}")

        # 1. Build request model
        req = PingPerfectRequest(
            street=address.street,
            houseNumber=address.house_number,
            plz=address.plz,
            city=address.city,
        )
        # dump to dict then to compact JSON
        payload_dict: Dict[str, Any] = req.model_dump(by_alias=True)
        payload_json: str = json.dumps(payload_dict, separators=(",", ":"))

        ts: str = str(int(time.time()))
        signature: str = sign(req, ts, PP_SECRET)

        headers: Dict[str, str] = {
            "X-Client-Id": PP_CLIENT_ID,
            "X-Timestamp": ts,
            "X-Signature": signature,
            "Content-Type": "application/json",
        }
        logger.debug(f"Ping Perfect request body={payload_json}")

        # 2. Call API
        try:
            resp = await self.client.post(
                PP_ENDPOINT,
                content=payload_json,
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()
            raw_items: list[dict] = resp.json()
            logger.info(
                f"Ping Perfect → HTTP {resp.status_code}, {len(raw_items)} offers"
            )
        except Exception as exc:
            logger.error("Ping Perfect request failed: %s", exc, exc_info=True)
            raise ProviderError(f"Ping Perfect failed: {exc}") from exc

        # 3. Transform → Offer
        offers: list[Offer] = []
        for item in raw_items:
            if item.get("productInfo") is None or item.get("pricingDetails") is None:
                continue
            info = item["productInfo"]
            price = item["pricingDetails"]
            provider_name = item.get("providerName", "")
            speed_val = info.get("speed")
            term_val = info.get("contractDurationInMonths")
            monthly_cents = price.get("monthlyCostInCent")
            limit_from = info.get("limitFrom")
            max_age_val = info.get("maxAge")

            product_uuid = uuid.uuid5(
                uuid.NAMESPACE_DNS,
                f"{provider_name}-{speed_val}-{term_val}",
            ).hex

            installation_included = str(
                price.get("installationService", "")
            ).strip().lower() in {"yes", "included", "true"}

            offers.append(
                Offer(
                    provider=self.name,
                    plan_name=provider_name,
                    product_id=product_uuid,
                    speed_down_mbit=int(speed_val) if speed_val is not None else None,
                    connection_type=info.get("connectionType") or None,
                    data_cap_gb=int(limit_from) if limit_from is not None else None,
                    price_cents_month_intro=(
                        int(monthly_cents) if monthly_cents else None
                    ),
                    price_cents_month_regular=(
                        int(monthly_cents) if monthly_cents else None
                    ),
                    contract_duration_months=(
                        int(term_val) if term_val is not None else None
                    ),
                    installation_service_included=installation_included,
                    tv_included=bool(info.get("tv")),
                    tv_package_name=info.get("tv") or None,
                    max_age=int(max_age_val) if max_age_val is not None else None,
                )
            )

        logger.info(f"PingPerfectProvider → returning {len(offers)} offers")
        return offers
