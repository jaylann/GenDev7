from __future__ import annotations

import asyncio
import json
import os
from typing import List

import httpx
from async_lru import alru_cache
from loguru import logger
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .base import ProviderBase, ProviderError
from ..core.config import get_settings
from ..models import Address
from ..models import Offer
from ..models.providers.verbyndich_request import VerbynDichRequest
from ..models.providers.verbyndich_response import VerbynDichResponse

# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #
settings = get_settings()

MAX_PAGES: int = 10  # hard cap – safety against runaway pagination
PARALLEL: int = 5  # pages in flight
PAGE_TMO: int = 15  # seconds

PAGE_FETCH_RETRY_ATTEMPTS: int = 3
PAGE_FETCH_RETRY_EXP_MULTIPLIER: int = 1
PAGE_FETCH_RETRY_EXP_MAX_WAIT: int = 10


# --------------------------------------------------------------------------- #
# Low-level page fetch with retry
# --------------------------------------------------------------------------- #
@alru_cache(maxsize=128)
@retry(
    stop=stop_after_attempt(PAGE_FETCH_RETRY_ATTEMPTS),
    wait=wait_exponential(
        multiplier=PAGE_FETCH_RETRY_EXP_MULTIPLIER,
        max=PAGE_FETCH_RETRY_EXP_MAX_WAIT,
    ),
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.HTTPStatusError)),
    reraise=True,
)
async def _page(client: httpx.AsyncClient, body: str, pg: int, api: str) -> dict:
    """
    POST one page of VerbynDich results.
    """
    r = await client.post(
        api,
        params={"apiKey": settings.verbyndich_api_key, "page": pg},
        content=body,
        timeout=PAGE_TMO,
    )
    r.raise_for_status()
    return r.json()


# --------------------------------------------------------------------------- #
# Provider
# --------------------------------------------------------------------------- #
class VerbynDichProvider(ProviderBase):
    """
    Fetches VerbynDich catalogue pages and normalises them into `Offer` objects.
    """

    name = "VerbynDich"

    async def fetch(self, address: Address) -> List[Offer]:
        """
        • POST the address once per page.
        • Run up to ``PARALLEL`` requests concurrently.
        • Stop when the API says ``"last": true`` or after ``MAX_PAGES``.
        """
        request = VerbynDichRequest(
            street=address.street,
            house_number=address.house_number,
            city=address.city,
            plz=address.plz,
        )
        body = request.to_body()
        sem = asyncio.Semaphore(PARALLEL)
        offers: List[Offer] = []
        pages: List[dict] = []

        async def _one(pg: int):
            async with sem:
                return pg, await _page(self.client, body, pg, settings.verbyndich_base)

        page_idx = 0
        pending = {asyncio.create_task(_one(i)) for i in range(PARALLEL)}

        while pending:
            done, pending = await asyncio.wait(
                pending, return_when=asyncio.FIRST_COMPLETED
            )
            for task in done:
                try:
                    pg_num, data = task.result()
                except Exception as exc:
                    logger.error("VerbynDich page parse failed", exc_info=True)
                    raise ProviderError(f"VerbynDich page parse failed: {exc}") from exc

                pages.append(data)

                response_model = VerbynDichResponse.from_dict(data)
                if not response_model.valid:
                    continue

                offers.append(response_model.to_offer(self.name))

                if response_model.last or pg_num >= MAX_PAGES:
                    for p in pending:
                        p.cancel()
                    pending.clear()
                    break

                # schedule next page
                page_idx += 1
                pending.add(asyncio.create_task(_one(page_idx)))

        # Write raw JSON pages to disk
        with open("verbyndich_response.json", "w", encoding="utf-8") as f:
            json.dump(pages, f, indent=2, ensure_ascii=False)

        logger.info(f"VerbynDichProvider: returning {len(offers)} offers")
        return offers
