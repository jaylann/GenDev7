from __future__ import annotations

import os
from io import StringIO

import pandas as pd
from loguru import logger

from .base import ProviderBase, ProviderError
from ..models import Offer, Address
from ..models.providers.byteme_request import ByteMeRequest
from ..models.providers.byteme_response import ByteMeResponse

BYTEME_ENDPOINT = os.getenv(
    "BYTEME_ENDPOINT",
    "https://byteme.gendev7.check24.fun/app/api/products/data",
)
BYTEME_API_KEY = os.getenv("BYTEME_API_KEY", "REPLACE_ME")
# ───────────────────────────────────────────────────────────────────────────────
# cleaning helpers
# ───────────────────────────────────────────────────────────────────────────────
from typing import Final, List

ESSENTIAL_NUMERIC: Final[List[str]] = [
    "productId",
    "speed",
    "monthlyCostInCent",
]

OPTIONAL_NUMERIC: Final[List[str]] = [
    "afterTwoYearsMonthlyCost",
    "durationInMonths",
    "limitFrom",
    "voucherValue",
]

BOOL_COLS: Final[List[str]] = ["installationService", "tv"]


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    """
    Sanitise the raw CSV from *Byte Me* so that the rest of the pipeline only
    ever sees *complete* and *sensible* rows.

    Steps
    -----
    1.  **Boolean columns** – map `true`/`false` → ``bool``, missing → ``False``.
    2.  **Numeric columns** – `pd.to_numeric(..., errors="coerce")`.
    3.  **Row-level validity** – drop rows where
        - an *essential* numeric field is *missing* **or** `<= 0`
        - `speed < 1` Mbit/s (garbage)
    4.  **De-duplicate** – keep the *cheapest* `monthlyCostInCent` for each
        `productId`.
    """
    # 1️⃣  Booleans
    for col in BOOL_COLS:
        mapped = (
            df[col]
            .astype(str)
            .str.strip()
            .str.lower()
            .map({"true": True, "false": False})
        )
        df[col] = mapped.infer_objects(copy=False).fillna(False).astype(bool)

    # 2️⃣  Numerics
    for col in ESSENTIAL_NUMERIC + OPTIONAL_NUMERIC:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # 3️⃣  Discard junk
    cond_missing = df[ESSENTIAL_NUMERIC].isna().any(axis=1)
    cond_zero_or_neg = (df[["speed", "monthlyCostInCent"]] <= 0).any(axis=1)
    cond_speed_too_low = df["speed"] < 1  # guard against “0 Mbit/s”

    before = len(df)
    df = df[~(cond_missing | cond_zero_or_neg | cond_speed_too_low)]
    logger.debug(
        "ByteMeProvider.clean – dropped %d malformed rows (kept %d)",
        before - len(df),
        len(df),
    )

    # 4️⃣  Canonicalise duplicates: cheapest price wins
    df = (
        df.sort_values("monthlyCostInCent")
        .drop_duplicates(subset="productId", keep="first")
        .reset_index(drop=True)
    )

    return df


class ByteMeProvider(ProviderBase):
    name = "ByteMe"

    async def fetch(self, address: Address) -> List[Offer]:
        logger.info(f"ByteMeProvider.fetch for address: {address}")

        request = ByteMeRequest(
            street=address.street,
            houseNumber=address.house_number,
            city=address.city,
            plz=address.plz,
        )
        params = request.model_dump()
        headers = {"X-Api-Key": BYTEME_API_KEY}

        try:
            resp = await self.client.get(
                BYTEME_ENDPOINT,
                params=params,
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()
            # Debug: save raw CSV response
            with open("byteme_response.csv", "wb") as f:
                f.write(resp.content)
            logger.debug(
                "ByteMeProvider: Saved raw CSV response to byteme_response.csv"
            )
            logger.info(f"Received HTTP {resp.status_code} from ByteMe endpoint")
        except Exception as exc:
            logger.error("ByteMe download failed", exc_info=True)
            raise ProviderError(f"ByteMe download failed: {exc}") from exc

        # Parse CSV (first row is header)
        df = pd.read_csv(StringIO(resp.text), header=0)
        df = _clean(df)

        offers: List[Offer] = []
        for row in df.itertuples(index=False):
            resp = ByteMeResponse.from_tuple(row)
            if not resp:
                continue
            offers.append(resp.to_offer(self.name))

        logger.info(f"Returning {len(offers)} ByteMe offers")
        return offers
