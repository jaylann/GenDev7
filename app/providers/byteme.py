from __future__ import annotations

from io import StringIO

import httpx
import pandas as pd
from loguru import logger

from .base import ProviderBase, ProviderError
from ..core.config import get_settings, Settings
from ..factories.byteme_factory import ByteMeOfferFactory
from ..models import Offer, Address
from ..models.providers.byteme_request import ByteMeRequest

settings: Settings = get_settings()
from typing import List, Dict, Any


class ByteMeProvider(ProviderBase):
    name: str = "ByteMe"

    async def fetch(self, address: Address) -> List[Offer]:
        logger.info(f"ByteMeProvider.fetch for address: {address}")

        request: ByteMeRequest = ByteMeRequest(
            street=address.street,
            houseNumber=address.house_number,
            city=address.city,
            plz=address.plz,
        )
        params: Dict[str, Any] = request.model_dump()
        headers: Dict[str, str] = {"X-Api-Key": settings.byteme_api_key}

        try:
            resp = await self.client.get(
                settings.byteme_endpoint,
                params=params,
                headers=headers,
                timeout=10,
            )
            resp: httpx.Response
            resp.raise_for_status()
            # Debug: save raw CSV response
            with open("byteme_response.csv", "wb") as f:
                f.write(resp.content)
            logger.debug(
                "ByteMeProvider: Saved raw CSV response to byteme_response.csv"
            )
            logger.info(f"Received HTTP {resp.status_code} from ByteMe endpoint")
        except Exception as exc:
            logger.error("ByteMe download failed", exc_info=True)
            raise ProviderError(f"ByteMe download failed: {exc}") from exc

        # Parse CSV (first row is header)
        df: pd.DataFrame = pd.read_csv(StringIO(resp.text), header=0)
        offers: List[Offer] = ByteMeOfferFactory.make_offers(df, self.name)
        logger.info(f"Returning {len(offers)} ByteMe offers")
        return offers
