"""
Adapter module for ByteMe provider integration.

Defines ByteMeProvider to request address-based offers from the ByteMe API,
parse CSV responses, and convert them into internal Offer models.
"""

from __future__ import annotations

from io import StringIO

import httpx
import pandas as pd
from typing import List, Dict, Any

from app.core import Settings, RetryConfig
from app.exceptions import ProviderError
from app.factories import ByteMeFactory
from app.models import Address, Offer
from app.models.providers.requests import ByteMeRequest
from app.providers.base import ProviderBase
from app.utils import get_settings, logger


class ByteMeProvider(ProviderBase):
    """
    Provider adapter for the ByteMe service.

    Fetches offers by sending HTTP requests to the ByteMe API endpoint,
    parsing the CSV response, and producing a list of Offer instances.
    """

    name: str = "ByteMe"

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        retry_config: RetryConfig | None = None,
    ) -> None:
        """
        Initialize ByteMeProvider with HTTP client and optional retry_config.
        """
        super().__init__(client, retry_config=retry_config)
        # load settings per instance
        self.settings = get_settings()

    async def fetch(self, address: Address) -> List[Offer]:
        """
        Perform data retrieval from the ByteMe API for a given address.

        Sends a GET request to the configured endpoint with address parameters
        and API key header, parses the CSV-formatted response, and converts
        rows into Offer objects.

        Args:
            address (Address): The address to query for offers.

        Returns:
            List[Offer]: List of offers returned by ByteMe.

        Raises:
            ProviderError: If the HTTP request fails or CSV parsing errors occur.
        """
        logger.info(f"ByteMeProvider.fetch for address: {address}")
        request: ByteMeRequest = ByteMeRequest(
            street=address.street,
            houseNumber=address.house_number,
            city=address.city,
            plz=address.plz,
        )
        params: Dict[str, Any] = request.model_dump()
        headers: Dict[str, str] = {"X-Api-Key": self.settings.byteme_api_key}

        try:
            resp = await self.client.get(
                self.settings.byteme_endpoint,
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
