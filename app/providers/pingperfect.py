from __future__ import annotations

import json
import os
import time
import uuid
from typing import List, Dict, Any

from app.utils.hmac_sign import sign
from app.utils.logger import logger
from .base import ProviderBase, ProviderError
from ..models import Address, Offer

PP_ENDPOINT = os.getenv("PINGPERFECT_ENDPOINT")
PP_CLIENT_ID = os.getenv("PINGPERFECT_CLIENT_ID", "REPLACE_ME")
PP_SECRET = os.getenv("PINGPERFECT_SECRET", "REPLACE_ME")


class PingPerfectProvider(ProviderBase):
    """
    Adapter for the *Ping Perfect* JSON API.

    The supplier’s response has **no dedicated product identifier**, so we create
    a stable UUID-5 from the commercial name + key technical attributes.
    If the API ever exposes a real `productId`, just swap that in.
    """

    name = "Ping Perfect"

    async def fetch(self, address: Address) -> List[Offer]:
        logger.info("PingPerfectProvider.fetch – address=%s", address)

        # ────────────────────────────────────────────────────────── 1  Request
        body: Dict[str, Any] = {"street": address.street, "houseNumber": address.house_number, "plz": address.plz,
            "city": address.city, "wantsFiber": False,  # MVP: DSL unless UI toggles it
        }
        payload = json.dumps(body, separators=(",", ":"))
        ts = str(int(time.time()))
        headers = {"X-Client-Id": PP_CLIENT_ID, "X-Timestamp": ts, "X-Signature": sign(payload, ts, PP_SECRET),
            "Content-Type": "application/json", }
        logger.debug("Ping Perfect request body=%s", payload)

        # ────────────────────────────────────────────────────────── 2  Call API
        try:
            resp = await self.client.post(PP_ENDPOINT, content=payload, headers=headers, timeout=10, )
            resp.raise_for_status()
            raw_items: List[Dict[str, Any]] = resp.json()
            logger.info("Ping Perfect → HTTP %s, %d offers", resp.status_code, len(raw_items))
        except Exception as exc:
            logger.error("Ping Perfect request failed: %s", exc, exc_info=True)
            raise ProviderError(f"Ping Perfect failed: {exc}") from exc

        # ──────────────────────────────────────────────── 3  Transform → Offer
        offers: List[Offer] = []
        for item in raw_items:
            logger.debug("PingPerfectProvider.fetch – raw item: %r", item)

            # ▸▸ Skip incomplete payloads (null productInfo OR pricingDetails)
            if item.get("productInfo") is None or item.get("pricingDetails") is None:
                logger.debug("PingPerfectProvider.fetch – skipping incomplete item (providerName=%s)",
                    item.get("providerName", "<unknown>"), )
                continue

            info = item["productInfo"]
            price = item["pricingDetails"]

            provider_name = item.get("providerName", "")
            speed_val = info.get("speed")  # type: ignore[arg-type]
            term_val = info.get("contractDurationInMonths")
            monthly_cents = price.get("monthlyCostInCent")
            connection_type_val = info.get("connectionType")
            limit_from = info.get("limitFrom")
            max_age_val = info.get("maxAge")

            logger.debug("PingPerfectProvider.fetch – extracted fields: "
                         "providerName=%r, speed=%r, contractDuration=%r, monthlyCostCent=%r, "
                         "connectionType=%r, limitFrom=%r, maxAge=%r", provider_name, speed_val, term_val,
                monthly_cents, connection_type_val, limit_from, max_age_val, )

            product_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"{provider_name}-{speed_val}-{term_val}", ).hex
            logger.debug("PingPerfectProvider.fetch – product_uuid=%s", product_uuid)

            installation_raw = str(price.get("installationService", "")).strip().lower()
            installation_included = installation_raw in {"yes", "included", "true"}

            offers.append(Offer(# --- Identification ---------------------------
                provider=self.name, plan_name=provider_name, product_id=product_uuid,
                # --- Performance ------------------------------
                speed_down_mbit=int(speed_val) if speed_val is not None else None,
                connection_type=connection_type_val or None,
                data_cap_gb=int(limit_from) if limit_from is not None else None,
                # --- Pricing ----------------------------------
                price_cents_month_intro=int(monthly_cents) if monthly_cents else None,
                price_cents_month_regular=int(monthly_cents) if monthly_cents else None,
                contract_duration_months=int(term_val) if term_val is not None else None,
                installation_service_included=installation_included, # --- TV ---------------------------------------
                tv_included=bool(info.get("tv")), tv_package_name=info.get("tv") or None,
                # --- Promotions & Audience --------------------
                max_age=int(max_age_val) if max_age_val is not None else None, ))

        logger.info("PingPerfectProvider → returning %d offers", len(offers))
        return offers
