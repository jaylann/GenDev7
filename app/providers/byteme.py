from __future__ import annotations

from io import StringIO

import httpx
import pandas as pd
from typing import List, Dict, Any

from app.core import Settings
from app.exceptions import ProviderError
from app.factories import ByteMeFactory
from app.models import Address, Offer
from app.models.providers.requests import ByteMeRequest
from app.providers.base import ProviderBase
from app.utils import get_settings, logger




class ByteMeProvider(ProviderBase):
    name: str = "ByteMe"


    async def fetch(self, address: Address) -> List[Offer]:
        logger.info(f"ByteMeProvider.fetch for address: {address}")
        settings: Settings = get_settings()
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
            logger.info(f"Received HTTP {resp.status_code} from ByteMe endpoint")
        except Exception as exc:
            logger.error("ByteMe download failed", exc_info=True)
            raise ProviderError(f"ByteMe download failed: {exc}") from exc

        # Parse CSV (first row is header)
        df: pd.DataFrame = pd.read_csv(StringIO(resp.text), header=0)
        offers: List[Offer] = ByteMeFactory.make_offers(df, self.name)
        logger.info(f"Returning {len(offers)} ByteMe offers")
        return offers
