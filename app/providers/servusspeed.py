# app/providers/servusspeed.py
from __future__ import annotations

import asyncio
from typing import List, Tuple, Optional, Dict, Any

import httpx
from aiocache import Cache, cached
from httpx import HTTPStatusError
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type

from app.core.config import get_settings
from app.models import Address, Offer
from app.utils.logger import logger as util_logger
from .base import ProviderBase, ProviderError
from ..factories.servusspeed_factory import ServusSpeedFactory

settings = get_settings()

# concurrency & timeout constants
MAX_PARALLEL = 3
DETAIL_READ_SECS = 30.0
DETAIL_CONNECT_SECS = 5.0
AVAILABLE_PRODUCTS_TIMEOUT = httpx.Timeout(30.0, connect=5.0)
PRODUCT_DETAILS_TIMEOUT = httpx.Timeout(
    timeout=DETAIL_READ_SECS, connect=DETAIL_CONNECT_SECS
)

_sem = asyncio.Semaphore(MAX_PARALLEL)


async def _post_json(
    client: httpx.AsyncClient,
    url: str,
    payload: Dict[str, Any],
    auth: Tuple[str, str],
    timeout: httpx.Timeout,
) -> httpx.Response:
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
        with open("servusspeed_response.json", "wb") as f:
            f.write(resp.content)
        util_logger.debug(f"Saved raw JSON from {url}")
        return resp
    except httpx.TimeoutException as e:
        util_logger.error(f"Timeout on POST to {url}: {e!r}")
        raise
    except (HTTPStatusError, httpx.RequestError) as e:
        status = getattr(e, "response", None)
        code = status.status_code if status is not None else "N/A"
        util_logger.error(f"HTTP {code} on POST to {url}: {e!r}")
        raise ProviderError(f"{url} → {e!r}") from e


class ServusSpeedProvider(ProviderBase):
    name = "Servus Speed"
    INTERNAL_PROVIDER_FETCH_TIMEOUT = 88.0
    MIN_TIME_FOR_DETAILS = 5.0

    @cached(ttl=43200, cache=Cache.MEMORY, key_builder=lambda f, self, address: address)
    @retry(
        stop=stop_after_attempt(2),
        wait=wait_fixed(1),
        retry=retry_if_exception_type((ProviderError, httpx.TimeoutException)),
        reraise=True,
    )
    async def fetch(self, address: Address) -> List[Offer]:
        loop = asyncio.get_event_loop()
        start = loop.time()

        if not settings.servusspeed_username or not settings.servusspeed_password:
            util_logger.critical("Credentials not set; skipping Servus Speed")
            return []

        util_logger.info(f"ServusSpeedProvider.fetch – {address}")

        # build 'available-products' body via factory
        body = ServusSpeedFactory.build_available_products_body(address)
        auth = (settings.servusspeed_username, settings.servusspeed_password)
        self._servus_body = body
        self._servus_auth = auth

        # fetch available product IDs
        try:
            resp_avail = await _post_json(
                self.client,
                f"{settings.servusspeed_base.rstrip('/')}/api/external/available-products",
                body,
                auth,
                AVAILABLE_PRODUCTS_TIMEOUT,
            )
            product_ids = resp_avail.json().get("availableProducts", [])
        except Exception as e:
            util_logger.error(f"Failed fetching available products: {e!r}")
            raise

        if not product_ids:
            util_logger.info("No products available")
            return []

        elapsed = loop.time() - start
        budget = self.INTERNAL_PROVIDER_FETCH_TIMEOUT - elapsed - 2.0
        if budget < self.MIN_TIME_FOR_DETAILS:
            util_logger.warning("Insufficient time for details; skipping")
            return []

        # fetch details in parallel
        tasks = [
            asyncio.create_task(self._fetch_one_product_details(pid))
            for pid in product_ids
        ]
        offers: List[Offer] = []
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=False),
                timeout=budget,
            )
            for o in results:
                if o:
                    offers.append(o)
        except asyncio.TimeoutError:
            util_logger.warning("Timed out gathering detail tasks")
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

        util_logger.info(f"Returning {len(offers)} offers")
        return offers

    @cached(ttl=43200, cache=Cache.MEMORY, key_builder=lambda f, self, pid: pid)
    async def _fetch_one_product_details(self, pid: str) -> Optional[Offer]:
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
        util_logger.debug(f"Fetching detail for {pid}")
        resp = await _post_json(
            self.client,
            f"{settings.servusspeed_base.rstrip('/')}/api/external/product-details/{pid}",
            body,
            auth,
            PRODUCT_DETAILS_TIMEOUT,
        )
        payload = resp.json()
        # parse detail via factory
        resp_model = ServusSpeedFactory.parse_detail_response(pid, payload)
        return resp_model.to_offer(self.name)
