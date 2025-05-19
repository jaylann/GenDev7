"""
Provider for fetching broadband offers from the VerbynDich API.

Supports paginated requests with retry and caching to efficiently
retrieve available offers for a given address.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
from async_lru import alru_cache
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core import RetryConfig
from app.factories import VerbynDichFactory
from app.models import Address, Offer
from app.providers.base import ProviderBase
from app.utils import get_settings
from app.utils import logger

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
async def _fetch_page(
    client: httpx.AsyncClient,
    base: str,
    api_key: str,
    body: str,
    page: int,
) -> dict:
    """
    Retrieve a single page of offer data with retry and in-memory caching.

    Args:
        client (httpx.AsyncClient): HTTP client for making the POST request.
        base (str): Base URL for the API.
        api_key (str): API key for authentication.
        body (str): Serialized request payload.
        page (int): Page index to fetch.

    Returns:
        dict: Parsed JSON response for the specified page.

    Raises:
        httpx.HTTPError: If the HTTP request fails after retries.
    """
    r = await client.post(
        base,
        params={"apiKey": api_key, "page": page},
        content=body,
        timeout=PAGE_TMO,
    )
    r.raise_for_status()
    return r.json()


class VerbynDichProvider(ProviderBase):
    """
    Adapter for VerbynDich service to fetch broadband offers.

    Implements paginated retrieval, converting raw responses into Offer models.
    """

    name: str = "VerbynDich"

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        retry_config: RetryConfig | None = None,
    ) -> None:
        """
        Initialize VerbynDichProvider with HTTP client and optional retry_config.
        """
        super().__init__(client, retry_config=retry_config)
        # load settings per instance
        self.settings = get_settings()

    async def fetch(self, address: Address) -> list[Offer]:
        """
        Retrieve all offers from VerbynDich for the specified address.

        Builds the request payload, fetches pages concurrently up to PARALLEL,
        stops when the last page is encountered, and accumulates Offer instances.

        Args:
            address (Address): The address to query offers for.

        Returns:
            List[Offer]: Offers available at the given address.
        """
        body: str = VerbynDichFactory.build_body(address)
        semaphore = asyncio.Semaphore(PARALLEL)
        offers: list[Offer] = []
        raw_pages: list[dict[str, Any]] = []

        async def _one(page: int) -> tuple[int, dict[str, Any]]:
            async with semaphore:
                return page, await _fetch_page(
                    self.client,
                    self.settings.verbyndich_base,
                    self.settings.verbyndich_api_key,
                    body,
                    page,
                )

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
