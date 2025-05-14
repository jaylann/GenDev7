from __future__ import annotations

import asyncio
import os
import re
from typing import List, Optional

import httpx
import json
from async_lru import alru_cache
from loguru import logger
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .base import ProviderBase, ProviderError
from ..models import Address, Offer
from ..models.base.offer import VoucherKind

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
VB_BASE: str = os.getenv("VERBYNDICH_BASE", "https://api.verbyn­dich.example/v1/deals")
VB_API_KEY: str = os.getenv("VERBYNDICH_API_KEY", "REPLACE_ME")

MAX_PAGES: int = 10     # hard cap – safety against runaway pagination
PARALLEL: int = 5       # pages in flight
PAGE_TMO: int = 15      # seconds

PAGE_FETCH_RETRY_ATTEMPTS: int = 3
PAGE_FETCH_RETRY_EXP_MULTIPLIER: int = 1
PAGE_FETCH_RETRY_EXP_MAX_WAIT: int = 10

# --------------------------------------------------------------------------- #
# Regex helpers (pre-compiled once at import time)
# --------------------------------------------------------------------------- #
PRICE_MONTH_RE = re.compile(
    r"für\s*nur\s*(\d+(?:[.,]\d+)?)\s*€\s*im\s*Monat", re.I
)
SPEED_RE = re.compile(r"(\d+)\s*Mbit", re.I)
DURATION_RE = re.compile(r"Mindestvertragslaufzeit\s*(\d+)\s*Monate?", re.I)
MAX_AGE_RE = re.compile(r"(?:unter|bis)\s*(\d+)\s*Jahr", re.I)
VOUCHER_RE = re.compile(r"Rabatt\s+von\s*(\d+)\s*€", re.I)
CONN_RE = re.compile(r"\b(DSL|Cable|Kabel|Fiber|Glasfaser|Mobile)\b", re.I)
TV_PKG_RE = re.compile(r"\b([A-Z][A-Za-z0-9+]*TV\+?)\b")
DATA_CAP_RE = re.compile(r"Ab\s*(\d+)\s*GB", re.I)

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
        params={"apiKey": VB_API_KEY, "page": pg},
        content=body,
        timeout=PAGE_TMO,
    )
    r.raise_for_status()
    # Keep one page on disk for debugging – last write wins.

    logger.debug("VerbynDichProvider: saved raw JSON → verbyndich_response.json")
    return r.json()

# --------------------------------------------------------------------------- #
# Description parser → Offer
# --------------------------------------------------------------------------- #
def _parse(data: dict) -> Offer:
    """
    Converts a VerbynDich JSON object into an `Offer`.

    The API gives us only *one* string field with free-text German prose –
    we therefore extract all commercial details with regexes.
    """
    desc: str = data.get("description", "")
    product_raw: str = data.get("product", "UNKNOWN")

    # ------------------------------------------------------------------- #
    # Helper extractors
    # ------------------------------------------------------------------- #
    def _match_rgx(rgx: re.Pattern[str]) -> Optional[str]:
        m = rgx.search(desc)
        return m.group(1) if m else None

    # price (4600 cents for "46 €")
    price_eur = _match_rgx(PRICE_MONTH_RE)
    price_cents = int(float(price_eur.replace(",", ".")) * 100) if price_eur else 0

    # downstream speed
    speed = int(_match_rgx(SPEED_RE) or 16)

    # min. contract term
    duration = int(_match_rgx(DURATION_RE) or 24)

    # age cap
    max_age = int(_match_rgx(MAX_AGE_RE)) if _match_rgx(MAX_AGE_RE) else None

    # voucher
    voucher_eur = _match_rgx(VOUCHER_RE)
    voucher_value_cents = int(voucher_eur) * 100 if voucher_eur else None
    voucher_type = VoucherKind.ABSOLUTE if voucher_value_cents else None

    # connection medium
    conn = _match_rgx(CONN_RE)
    conn_map = {
        "dsl": "DSL",
        "cable": "Cable",
        "kabel": "Cable",
        "fiber": "Fiber",
        "glasfaser": "Fiber",
        "mobile": "Mobile",
    }
    connection_type = conn_map.get(conn.lower(), "DSL") if conn else "DSL"

    # TV package
    tv_pkg = _match_rgx(TV_PKG_RE)
    tv_included = bool(tv_pkg)

    # data cap in GB
    data_cap_str = _match_rgx(DATA_CAP_RE)
    data_cap_gb = int(data_cap_str) if data_cap_str else None

    # plan name (strip "VerbynDich " prefix, keep remainder)
    plan_name = product_raw
    if plan_name.lower().startswith("verbyndich"):
        plan_name = plan_name.split(" ", 1)[1].strip()

    # ------------------------------------------------------------------- #
    # Build Offer
    # ------------------------------------------------------------------- #
    return Offer(
        provider=VerbynDichProvider.name,
        plan_name=plan_name,
        product_id=product_raw,  # the API does not expose a numeric ID
        speed_down_mbit=speed,
        connection_type=connection_type,
        price_cents_month_intro=price_cents,
        price_cents_month_regular=price_cents,  # price stays the same after promo
        contract_duration_months=duration,
        installation_service_included=False,
        installation_cost_cents=None,
        tv_included=tv_included,
        tv_package_name=tv_pkg,
        data_cap_gb=data_cap_gb,
        voucher_type=voucher_type,
        voucher_value_cents=voucher_value_cents,
        max_age=max_age,
    )

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
        body = f"{address.street};{address.house_number};{address.city};{address.plz}"
        sem = asyncio.Semaphore(PARALLEL)
        offers: List[Offer] = []
        pages: List[dict] = []

        async def _one(pg: int):
            async with sem:
                return pg, await _page(self.client, body, pg, VB_BASE)

        page_idx = 0
        pending = {asyncio.create_task(_one(i)) for i in range(PARALLEL)}

        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                try:
                    pg_num, data = task.result()
                except Exception as exc:
                    logger.error("VerbynDich page parse failed", exc_info=True)
                    raise ProviderError(f"VerbynDich page parse failed: {exc}") from exc

                pages.append(data)

                if not data.get("valid", False):
                    continue

                offers.append(_parse(data))

                if data.get("last", False) or pg_num >= MAX_PAGES:
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
