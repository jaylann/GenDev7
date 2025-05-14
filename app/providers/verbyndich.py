# app/providers/verbyndich.py
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

from app.core.config import get_settings
from app.models import Address, Offer
from .base import ProviderBase
from ..factories.verbyndich_factory import VerbynDichFactory

settings = get_settings()

# Pagination/cache constants
MAX_PAGES = 10
PARALLEL = 5
PAGE_TMO = 15
PAGE_FETCH_RETRY_ATTEMPTS = 3
PAGE_FETCH_RETRY_EXP_MULTIPLIER = 1
PAGE_FETCH_RETRY_EXP_MAX_WAIT = 10


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
async def _fetch_page(client: httpx.AsyncClient, body: str, page: int) -> dict:
    r = await client.post(
        settings.verbyndich_base,
        params={"apiKey": settings.verbyndich_api_key, "page": page},
        content=body,
        timeout=PAGE_TMO,
    )
    r.raise_for_status()
    return r.json()


class VerbynDichProvider(ProviderBase):
    name = "VerbynDich"

    async def fetch(self, address: Address) -> List[Offer]:
        """
        • Build the request body via the factory.
        • Fetch up to MAX_PAGES pages in parallel with retries.
        • Parse each item via the factory.
        • Convert valid responses to Offer.
        """
        body = VerbynDichFactory.build_body(address)
        sem = asyncio.Semaphore(PARALLEL)
        pages: List[dict] = []
        offers: List[Offer] = []

        async def _one(pg: int):
            async with sem:
                return pg, await _fetch_page(self.client, body, pg)

        # start initial batch
        pending = {asyncio.create_task(_one(i)) for i in range(PARALLEL)}
        next_page = PARALLEL

        while pending:
            done, pending = await asyncio.wait(
                pending, return_when=asyncio.FIRST_COMPLETED
            )
            for task in done:
                pg, data = task.result()
                pages.append(data)

                # parse via factory
                response = VerbynDichFactory.parse_response(data)
                if response and response.valid:
                    offers.append(response.to_offer(self.name))

                # stop conditions
                if not response or response.last or pg + 1 >= MAX_PAGES:
                    for t in pending:
                        t.cancel()
                    pending.clear()
                    break

                # queue next
                pending.add(asyncio.create_task(_one(next_page)))
                next_page += 1

        # persist raw pages for debugging
        os.makedirs("logs", exist_ok=True)
        with open("logs/verbyndich_response.json", "w", encoding="utf-8") as f:
            json.dump(pages, f, indent=2, ensure_ascii=False)

        logger.info(f"VerbynDichProvider → returning {len(offers)} offers")
        return offers
