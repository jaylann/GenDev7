# app/providers/pingperfect.py
from __future__ import annotations

import json
import os
import time
from typing import Dict, Any
from typing import List

from loguru import logger

from app.utils.hmac_sign import sign
from .base import ProviderBase, ProviderError
from ..models import Address
from ..models import Offer
from ..models.providers.ping_perfect_request import PingPerfectRequest
from ..models.providers.pingperfect_response import PingPerfectResponse

PP_ENDPOINT = os.getenv("PINGPERFECT_ENDPOINT")
PP_CLIENT_ID = os.getenv("PINGPERFECT_CLIENT_ID", "REPLACE_ME")
PP_SECRET = os.getenv("PINGPERFECT_SECRET", "REPLACE_ME")


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
            response_model = PingPerfectResponse.from_item(item)
            if not response_model:
                continue
            offers.append(response_model.to_offer(self.name))

        logger.info(f"PingPerfectProvider → returning {len(offers)} offers")
        return offers
