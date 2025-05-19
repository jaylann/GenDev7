"""
Asynchronous provider implementation for ServusSpeed.

Defines HTTP helpers and a provider class to retrieve available products
and detailed offers using concurrent requests with retry support.
"""
from __future__ import annotations

import asyncio
import json
from typing import List, Tuple, Optional, Dict, Any

import httpx
from aiocache import Cache, cached
from httpx import HTTPStatusError
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type

from app.core import Settings, RetryConfig
from app.exceptions import ProviderError
from app.factories import ServusSpeedFactory
from app.models import Address, Offer
from app.providers.base import ProviderBase
from app.utils import get_settings, logger


# concurrency & timeout constants
MAX_PARALLEL = 3
DETAIL_READ_SECS = 60.0
DETAIL_CONNECT_SECS = 5.0
AVAILABLE_PRODUCTS_TIMEOUT = httpx.Timeout(60.0, connect=5.0)
PRODUCT_DETAILS_TIMEOUT = httpx.Timeout(
    timeout=DETAIL_READ_SECS, connect=DETAIL_CONNECT_SECS
)

_sem: asyncio.Semaphore = asyncio.Semaphore(MAX_PARALLEL)


async def _post_json(
    client: httpx.AsyncClient,
    url: str,
    payload: Dict[str, Any],
    auth: Tuple[str, str],
    timeout: httpx.Timeout,
) -> httpx.Response:
    """
    Perform a JSON HTTP POST with authentication and timeout handling.

    Args:
        client (httpx.AsyncClient): HTTP client instance.
        url (str): The endpoint URL.
        payload (Dict[str, Any]): JSON-serializable request body.
        auth (Tuple[str, str]): Basic auth credentials (username, password).
        timeout (httpx.Timeout): Timeout settings for the request.

    Returns:
        httpx.Response: The successful HTTP response.

    Raises:
        ProviderError: On HTTP status errors or unexpected redirects.
        httpx.TimeoutException: On request timeout.
        httpx.RequestError: On other request failures.
    """
    try:
        resp = await client.post(
            url,
            json=payload,
            auth=auth,
            timeout=timeout,
            follow_redirects=False,
        )
        if resp.status_code == 302:
            location = resp.headers.get("location")
            raise ProviderError(f"Redirected from {url} to {location}")
        resp.raise_for_status()
        logger.debug(f"Received JSON from {url}")
        return resp
    except httpx.TimeoutException as e:
        logger.error(f"Timeout on POST to {url}: {e!r}")
        raise
    except (HTTPStatusError, httpx.RequestError) as e:
        status = getattr(e, "response", None)
        code = status.status_code if status is not None else "N/A"
        logger.error(f"HTTP {code} on POST to {url}: {e!r}")
        raise ProviderError(f"{url} → {e!r}") from e


class ServusSpeedProvider(ProviderBase):
    name: str = "ServusSpeed"
    INTERNAL_PROVIDER_FETCH_TIMEOUT: float = 88.0
    MIN_TIME_FOR_DETAILS: float = 5.0

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        retry_config: RetryConfig | None = None,
    ) -> None:
        """
        Initialize ServusSpeedProvider with HTTP client and optional retry_config.
        """
        super().__init__(client, retry_config=retry_config)
        # load settings per instance
        self.settings = get_settings()
        # initialize attributes for later assignment
        self._servus_body: Optional[Dict[str, Any]] = None
        self._servus_auth: Optional[Tuple[str, str]] = None

    async def fetch(self, address: Address) -> List[Offer]:
        """
        Retrieve available product IDs and fetch their details.

        Performs credential checks, builds request bodies, and gathers detailed
        offers in parallel within a time budget.

        Args:
            address (Address): The target address for lookup.

        Returns:
            List[Offer]: List of retrieved offers, may be empty on errors or timeouts.
        """
        loop: asyncio.AbstractEventLoop = asyncio.get_event_loop()
        start: float = loop.time()

        if not self.settings.servusspeed_username or not self.settings.servusspeed_password:
            logger.critical("Credentials not set; skipping Servus Speed")
            return []

        logger.info(f"ServusSpeedProvider.fetch – {address}")

        # build 'available-products' body via factory
        body: Dict[str, Any] = ServusSpeedFactory.build_available_products_body(address)
        auth: Tuple[str, str] = (
            self.settings.servusspeed_username,
            self.settings.servusspeed_password,
        )
        self._servus_body = body
        self._servus_auth = auth

        # fetch available product IDs
        try:
            resp_avail = await _post_json(
                self.client,
                f"{self.settings.servusspeed_base.rstrip('/')}/api/external/available-products",
                body,
                auth,
                AVAILABLE_PRODUCTS_TIMEOUT,
            )
            product_ids: List[str] = resp_avail.json().get("availableProducts", [])
        except Exception as e:
            logger.error(f"Failed fetching available products: {e!r}")
            raise

        if not product_ids:
            logger.info("No products available")
            return []

        elapsed: float = loop.time() - start
        budget: float = self.INTERNAL_PROVIDER_FETCH_TIMEOUT - elapsed - 2.0
        if budget < self.MIN_TIME_FOR_DETAILS:
            logger.warning("Insufficient time for details; skipping")
            return []

        # fetch details in parallel
        tasks: List[asyncio.Task[Optional[Offer]]] = [
            asyncio.create_task(self._fetch_one_product_details(pid))
            for pid in product_ids
        ]
        offers: List[Offer] = []
        try:
            results: List[Optional[Offer]] = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=False),
                timeout=budget,
            )
            for o in results:
                if o:
                    offers.append(o)
        except asyncio.TimeoutError:
            logger.warning("Timed out gathering detail tasks")
            for t in tasks:
                if t.done() and not t.cancelled():
                    try:
                        res = t.result()
                        if res:
                            offers.append(res)
                    except Exception:
                        pass
                elif not t.done():
                    t.cancel()

        logger.info(f"Returning {len(offers)} offers")
        return offers

    async def _fetch_one_product_details(self, pid: str) -> Optional[Offer]:
        """
        Fetch product details for a single product ID under concurrency control.

        Acquires a semaphore to limit parallel requests and invokes the retrying fetch.

        Args:
            pid (str): The product identifier.

        Returns:
            Optional[Offer]: The Offer if successful, or None on failure.
        """
        async with _sem:
            try:
                offer = await self._fetch_details_with_retry(
                    pid, self._servus_body, self._servus_auth
                )
                return offer
            except Exception:
                return None

    @retry(
        stop=stop_after_attempt(1),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.RequestError)),
        reraise=True,
    )
    async def _fetch_details_with_retry(
        self, pid: str, body: Dict[str, Any], auth: Tuple[str, str]
    ) -> Offer:
        """
        Fetch product details with a single retry attempt on network errors.

        Args:
            pid (str): Product identifier.
            body (Dict[str, Any]): Request body from available-products.
            auth (Tuple[str, str]): Authentication credentials.

        Returns:
            Offer: The parsed offer model.

        Raises:
            httpx.TimeoutException: On request timeout.
            httpx.RequestError: On other network failures.
        """
        logger.debug(f"Fetching detail for {pid}")
        resp = await _post_json(
            self.client,
            f"{self.settings.servusspeed_base.rstrip('/')}/api/external/product-details/{pid}",
            body,
            auth,
            PRODUCT_DETAILS_TIMEOUT,
        )
        payload = resp.json()

        resp_model = ServusSpeedFactory.parse_detail_response(pid, payload)
        return resp_model.to_offer(self.name)
