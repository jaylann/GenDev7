from __future__ import annotations

import asyncio
import os
from typing import List, Tuple
from typing import Optional, Dict, Any

import httpx
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type

from app.utils.logger import logger
from .base import ProviderBase, ProviderError
from ..models import Address
from ..models import Offer
from ..models.providers.servus_speed_address import ServusSpeedAddress
from ..models.providers.servus_speed_request import ServusSpeedRequest
from ..models.providers.servusspeed_response import ServusSpeedResponse

# ─────────────────────────────  config  ────────────────────────────────────
SS_BASE: str = os.getenv("SERVUSSPEED_BASE", "").rstrip("/")
SS_USER: Optional[str] = os.getenv("SERVUSSPEED_USERNAME")
SS_PASS: Optional[str] = os.getenv("SERVUSSPEED_PASSWORD")

if not (SS_BASE and SS_USER and SS_PASS):
    logger.error(
        "SERVUSSPEED_BASE, SERVUSSPEED_USERNAME, or SERVUSSPEED_PASSWORD env-vars missing."
    )
    raise RuntimeError(
        "ServusSpeedProvider: Credentials missing. Provider will be unavailable."
    )

AVAILABLE_EP: str = f"{SS_BASE}/api/external/available-products"
DETAILS_EP: str = f"{SS_BASE}/api/external/product-details"

MAX_PARALLEL: int = 1  # Reduced concurrency due to API slowness
DETAIL_READ_SECS: float = 20.0  # Timeout for a single detail request attempt
DETAIL_CONNECT_SECS: float = 5.0

_sem: asyncio.Semaphore = asyncio.Semaphore(MAX_PARALLEL)

AVAILABLE_PRODUCTS_TIMEOUT_CONFIG: httpx.Timeout = httpx.Timeout(20.0, connect=5.0)
PRODUCT_DETAILS_TIMEOUT_CONFIG: httpx.Timeout = httpx.Timeout(
    timeout=DETAIL_READ_SECS, connect=DETAIL_CONNECT_SECS
)


# ───────────────────────  low-level one-shot helper  ───────────────────────
async def _post_json(
    client: httpx.AsyncClient,
    url: str,
    payload: Dict[str, Any],
    auth: Tuple[str, str],
    timeout: httpx.Timeout,
) -> httpx.Response:
    try:
        resp: httpx.Response = await client.post(
            url,
            json=payload,
            auth=auth,
            timeout=timeout,
            follow_redirects=False,
        )
        if resp.status_code == 302:
            location: Optional[str] = resp.headers.get("location")
            logger.warning(
                f"ServusSpeed API at {url} redirected to {location}. This is an error."
            )
            raise ProviderError(f"ServusSpeed API redirected from {url} to {location}")

        resp.raise_for_status()
        # Debug: save raw JSON response
        with open("servusspeed_response.json", "wb") as f:
            f.write(resp.content)
        logger.debug(
            f"ServusSpeedProvider: Saved raw JSON response from {url} to servusspeed_response.json"
        )
        return resp
    except httpx.TimeoutException as e:
        logger.error(
            f"Timeout ({type(e).__name__}) during POST to {url}. Payload (first 100): {str(payload)[:100]}... Error details: {repr(e)}"
        )
        raise
    except httpx.RequestError as e:
        logger.error(
            f"RequestError during POST to {url}. Payload (first 100): {str(payload)[:100]}... Error: {repr(e)}"
        )
        raise ProviderError(
            f"Network error connecting to ServusSpeed API at {url}: {repr(e)}"
        ) from e


# ────────────────────────────  provider  ───────────────────────────────────
class ServusSpeedProvider(ProviderBase):
    name: str = "Servus Speed"
    # Internal timeout for the entire fetch operation of this provider.
    # Should be slightly less than the global provider timeout in app.api.compare.py (60s).
    INTERNAL_PROVIDER_FETCH_TIMEOUT: float = 88
    # Minimum time allocated for detail fetching after getting product IDs.
    MIN_TIME_FOR_DETAILS: float = 5.0

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_fixed(1),
        retry=retry_if_exception_type((ProviderError, httpx.TimeoutException)),
        reraise=True,
    )
    async def fetch(self, address: Address) -> List[Offer]:
        loop = asyncio.get_event_loop()
        fetch_start_time: float = loop.time()

        if not SS_USER or not SS_PASS:
            logger.critical(
                "ServusSpeedProvider cannot fetch: Credentials not configured properly."
            )
            return []

        logger.info(
            f"ServusSpeedProvider: Starting fetch for {address.street}, {address.plz} {address.city}"
        )

        request_addr = ServusSpeedAddress(
            strasse=address.street,
            hausnummer=address.house_number,
            postleitzahl=address.plz,
            stadt=address.city,
            land=address.country_code,
        )
        body = ServusSpeedRequest(address=request_addr).model_dump()
        auth = (SS_USER, SS_PASS)

        try:
            logger.debug("ServusSpeedProvider: Fetching available product IDs...")
            resp_available = await _post_json(
                self.client, AVAILABLE_EP, body, auth, AVAILABLE_PRODUCTS_TIMEOUT_CONFIG
            )
            product_ids: List[str] = resp_available.json().get("availableProducts", [])
            logger.debug(f"ServusSpeedProvider: Found {len(product_ids)} product IDs.")
            if not product_ids:
                logger.info("ServusSpeedProvider: No available product IDs found.")
                return []
        except Exception as e:  # Broad catch for issues during available products fetch
            logger.error(
                f"ServusSpeedProvider: Failed to fetch or parse available products: {repr(e)}"
            )
            if isinstance(
                e, (ProviderError, httpx.TimeoutException)
            ):  # Reraise for main retry
                raise
            return []  # Otherwise, return empty, cannot proceed

        time_after_available_products: float = loop.time()
        elapsed_for_available: float = time_after_available_products - fetch_start_time

        # Calculate remaining time budget for fetching details
        # Subtract a small buffer (e.g., 2 seconds) for processing and return.
        remaining_time_for_details: float = (
            self.INTERNAL_PROVIDER_FETCH_TIMEOUT - elapsed_for_available - 2.0
        )

        if (
            remaining_time_for_details < self.MIN_TIME_FOR_DETAILS
        ):  # e.g. if getting IDs took too long
            logger.warning(
                f"ServusSpeedProvider: Not enough time ({remaining_time_for_details:.2f}s) for product details after getting IDs (took {elapsed_for_available:.2f}s). Skipping details."
            )
            return []

        logger.debug(
            f"ServusSpeedProvider: Available products took {elapsed_for_available:.2f}s. Budget for details: {remaining_time_for_details:.2f}s."
        )

        tasks: List[asyncio.Task[Optional[Offer]]] = [
            asyncio.create_task(self._fetch_one_product_details(pid, body, auth))
            for pid in product_ids
        ]

        gathered_offers: List[Optional[Offer]] = []
        try:
            # return_exceptions=True: asyncio.gather will not stop on first exception,
            # allowing us to collect all results, including exceptions from tasks.
            # _fetch_one_product_details is designed to return None on error, not raise.
            # So, exceptions here would be unexpected if _fetch_one_product_details works as intended.
            # However, for robustness against asyncio.TimeoutError from wait_for, this is fine.
            # Let _fetch_one_product_details manage its own errors and return Optional[Offer].
            all_task_results = await asyncio.wait_for(
                asyncio.gather(
                    *tasks, return_exceptions=False
                ),  # _fetch_one_product_details returns Optional[Offer]
                timeout=remaining_time_for_details,
            )
            # If gather completes, all_task_results is a list of Optional[Offer]
            gathered_offers.extend(filter(None, all_task_results))

        except asyncio.TimeoutError:
            logger.warning(
                f"ServusSpeedProvider: Timed out after {remaining_time_for_details:.2f}s while gathering product details. Processing completed tasks."
            )
            # Collect results from tasks that finished before the gather was cancelled
            for task in tasks:
                if task.done() and not task.cancelled():
                    try:
                        result = (
                            task.result()
                        )  # Get result if task finished successfully
                        if (
                            result is not None
                        ):  # _fetch_one_product_details returns Optional[Offer]
                            gathered_offers.append(result)
                    except Exception as task_exc:
                        # This means the task itself failed with an unexpected exception
                        # (not caught by _fetch_one_product_details internal try-except)
                        logger.error(
                            f"ServusSpeedProvider: Task for a product resulted in unhandled exception: {repr(task_exc)}"
                        )
                elif not task.done():  # Task was still running when gather timed out
                    task.cancel()  # Ensure pending tasks are cancelled

        valid_offers: List[Offer] = [
            offer for offer in gathered_offers if offer is not None
        ]

        total_fetch_time: float = loop.time() - fetch_start_time
        logger.info(
            f"ServusSpeedProvider: Fetch completed. Got {len(valid_offers)} offers from {len(product_ids)} IDs in {total_fetch_time:.2f}s (overall budget {self.INTERNAL_PROVIDER_FETCH_TIMEOUT:.2f}s)."
        )
        return valid_offers

    async def _fetch_one_product_details(
        self, pid: str, body: Dict[str, Any], auth: Tuple[str, str]
    ) -> Optional[Offer]:
        async with _sem:  # Controls concurrency: MAX_PARALLEL = 5
            try:
                # _fetch_details_with_retry: 1 attempt, 20s read timeout (PRODUCT_DETAILS_TIMEOUT_CONFIG)
                offer = await self._fetch_details_with_retry(pid, body, auth)
                return offer
            except (
                httpx.TimeoutException,
                httpx.RequestError,
            ) as e:  # Catch re-raised network/timeout errors
                logger.warning(
                    f"ServusSpeedProvider: Product {pid} skipped. {type(e).__name__}: {str(e)[:200]}"
                )
                return None
            except ProviderError as e:
                logger.warning(
                    f"ServusSpeedProvider: Product {pid} skipped due to ProviderError: {e}"
                )
                return None
            except Exception as exc:
                logger.exception(
                    f"ServusSpeedProvider: Product {pid} skipped due to UNEXPECTED error: {repr(exc)}"
                )
                return None

    # ────────────────────────────────────────────────────────────────────────────
    @retry(
        stop=stop_after_attempt(1),  # one HTTP attempt per PID
        retry=retry_if_exception_type(  # network failures → retry
            (httpx.TimeoutException, httpx.RequestError)
        ),
        reraise=True,
    )
    async def _fetch_details_with_retry(
        self,
        pid: str,
        body: Dict[str, Any],
        auth: Tuple[str, str],
    ) -> Offer:
        """Fetch *one* product and convert it into an :class:`Offer`."""

        logger.debug(
            f"ServusSpeedProvider: Fetching detail for PID {pid} "
            f"(timeout {DETAIL_READ_SECS}s)"
        )

        resp_detail = await _post_json(
            self.client,
            f"{DETAILS_EP}/{pid}",
            body,
            auth,
            PRODUCT_DETAILS_TIMEOUT_CONFIG,
        )

        payload = resp_detail.json()
        response_model = ServusSpeedResponse.from_json(pid, payload)
        return response_model.to_offer(self.name)
