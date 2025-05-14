from __future__ import annotations

from typing import List, Optional, Final

import pandas as pd
from loguru import logger

from ..models import Offer
from ..models.providers.byteme_response import ByteMeResponse

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


class ByteMeOfferFactory:
    @classmethod
    def from_tuple(cls, row) -> Optional[ByteMeResponse]:
        """
        Convert a pandas namedtuple row into a ByteMeResponse via the existing ByteMeResponse.from_tuple.
        """
        # skip rows without a valid intro price
        if pd.isna(row.monthlyCostInCent):
            return None
        tv_pkg = row.tv if isinstance(row.tv, str) and row.tv.strip() else None
        return ByteMeResponse(
            provider_name=row.providerName,
            product_id=str(int(row.productId)),
            speed_down_mbit=int(round(row.speed)),
            price_cents_month_intro=int(row.monthlyCostInCent),
            price_cents_month_regular=int(row.afterTwoYearsMonthlyCost),
            contract_duration_months=int(row.durationInMonths),
            connection_type=row.connectionType,
            installation_service_included=row.installationService,
            tv_included=bool(row.tv),
            tv_package_name=tv_pkg,
            data_cap_gb=int(row.limitFrom) if pd.notna(row.limitFrom) else None,
            voucher_type=row.voucherType if pd.notna(row.voucherType) else None,
            voucher_value_cents=(
                int(row.voucherValue) if pd.notna(row.voucherValue) else None
            ),
            max_age=int(row.maxAge) if pd.notna(row.maxAge) else None,
        )

    @classmethod
    def clean_df(cls, df: pd.DataFrame) -> pd.DataFrame:
        """
        Sanitise raw ByteMe CSV so that the rest of the pipeline only sees complete and sensible rows.

        Steps:
        1. Map boolean columns.
        2. Convert numeric columns.
        3. Discard malformed rows.
        4. Deduplicate by cheapest monthly cost.
        """
        # Boolean columns
        for col in BOOL_COLS:
            mapped = (
                df[col]
                .astype(str)
                .str.strip()
                .str.lower()
                .map({"true": True, "false": False})
            )
            df[col] = mapped.infer_objects(copy=False).fillna(False).astype(bool)

        # Numerics
        for col in ESSENTIAL_NUMERIC + OPTIONAL_NUMERIC:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        # Discard malformed
        cond_missing = df[ESSENTIAL_NUMERIC].isna().any(axis=1)
        cond_zero_or_neg = (df[["speed", "monthlyCostInCent"]] <= 0).any(axis=1)
        cond_speed_too_low = df["speed"] < 1
        before_count = len(df)
        df = df[~(cond_missing | cond_zero_or_neg | cond_speed_too_low)]
        logger.debug(
            f"ByteMeOfferFactory.clean_df – dropped {before_count - len(df)} malformed rows (kept {len(df)})"
        )

        # Deduplicate: keep cheapest
        df = (
            df.sort_values("monthlyCostInCent")
            .drop_duplicates(subset="productId", keep="first")
            .reset_index(drop=True)
        )

        return df

    @classmethod
    def make_responses(cls, df: pd.DataFrame) -> List[ByteMeResponse]:
        cleaned = cls.clean_df(df)
        responses: List[ByteMeResponse] = []
        for row in cleaned.itertuples(index=False):
            resp = cls.from_tuple(row)
            if resp:
                responses.append(resp)
        return responses

    @classmethod
    def make_offers(cls, df: pd.DataFrame, provider_name: str) -> List[Offer]:
        return [resp.to_offer(provider_name) for resp in cls.make_responses(df)]
