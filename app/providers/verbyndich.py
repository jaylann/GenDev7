from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import httpx
from async_lru import alru_cache
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core import Settings
from app.factories import VerbynDichFactory
from app.models import Address, Offer
from app.providers.base import ProviderBase
from app.utils import get_settings
from app.utils import logger

settings: Settings = get_settings()

# Pagination/cache constants
MAX_PAGES = 20
PARALLEL = 10
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
    name: str = "VerbynDich"

    async def fetch(self, address: Address) -> list[Offer]:
        """
        Fetch all VerbynDich offers available at *address*.

        The algorithm

        1.  Builds the request body with :pyclass:`VerbynDichFactory`.
        2.  Starts ``PARALLEL`` page-fetch tasks.
        3.  As pages return, parses them into :pyclass:`Offer` objects.
        4.  **Immediately cancels every still-running task after the first
            response whose ``last`` flag is *True*.**
        5.  Persists the raw JSON for observability.

        Returns
        -------
        list[Offer]
            All successfully parsed offers.
        """
        body: str = VerbynDichFactory.build_body(address)
        semaphore = asyncio.Semaphore(PARALLEL)
        offers: list[Offer] = []
        raw_pages: list[dict[str, Any]] = []

        async def _one(page: int) -> tuple[int, dict[str, Any]]:
            async with semaphore:
                return page, await _fetch_page(self.client, body, page)

        # Fire off the first batch
        pending: set[asyncio.Task[tuple[int, dict[str, Any]]]] = {
            asyncio.create_task(_one(i)) for i in range(PARALLEL)
        }
        next_page: int = PARALLEL
        last_page_seen = False

        while pending:
            done, pending = await asyncio.wait(
                pending, return_when=asyncio.FIRST_COMPLETED
            )

            # --- Parse finished tasks -------------------------------------------------
            for task in done:
                try:
                    page_no, data = task.result()
                except asyncio.CancelledError:  # pragma: no cover
                    continue  # Task was cancelled after last page appeared.
                except Exception as exc:  # pragma: no cover
                    logger.error("VerbynDichProvider → page task failed: {}", exc)
                    continue

                raw_pages.append(data)
                resp = VerbynDichFactory.parse_response(data)
                if resp and resp.valid:
                    offers.append(resp.to_offer(self.name))

                if resp and resp.last:
                    last_page_seen = True
                    logger.debug(
                        "VerbynDichProvider → last page ({}) encountered; "
                        "cancelling remaining tasks",
                        page_no,
                    )

            # --- Early exit? ----------------------------------------------------------
            if last_page_seen:
                # stop waiting for anything that is still in flight
                for task in pending:
                    task.cancel()
                # gather ensures we silence cancellation exceptions
                await asyncio.gather(*pending, return_exceptions=True)
                break

            # --- Queue the next page --------------------------------------------------
            if next_page < MAX_PAGES:
                pending.add(asyncio.create_task(_one(next_page)))
                next_page += 1

        logger.info("VerbynDichProvider → returning {} offers", len(offers))
        return offers
