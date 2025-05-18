from __future__ import annotations

from typing import List, Optional, Final, Any

import pandas as pd
from loguru import logger

from ..models import Offer
from ..models.providers.byteme_response import ByteMeResponse


class ByteMeOfferFactory:
    # ──────────────────────────────────────────────────
    # Column sets & constants
    # ──────────────────────────────────────────────────
    _ESSENTIAL_NUMERIC_COLS: Final[List[str]] = [
        "productId",
        "speed",
        "monthlyCostInCent",
        "afterTwoYearsMonthlyCost",
        "durationInMonths",
    ]
    _OPTIONAL_NUMERIC_COLS: Final[List[str]] = [
        "limitFrom",
        "voucherValue",
        "maxAge",
    ]
    _ESSENTIAL_STRING_COLS: Final[List[str]] = ["connectionType"]

    _STANDARD_BOOL_COLS: Final[List[str]] = ["installationService"]

    _PROVIDER_NAME_COL: Final[str] = "providerName"
    _TV_SOURCE_COL: Final[str] = "tv"
    _TV_INCLUDED_FLAG_COL: Final[str] = "_tv_is_included_internal_"  # original name

    # ──────────────────────────────────────────────────
    # Single-row converter
    # ──────────────────────────────────────────────────
    @classmethod
    def from_tuple(cls, row: pd.Series) -> Optional[ByteMeResponse]:
        try:
            # Provider name
            raw_provider = getattr(row, cls._PROVIDER_NAME_COL, None)
            provider_name = (
                str(raw_provider).split(",", 1)[0].strip()
                if pd.notna(raw_provider) and str(raw_provider).strip()
                else None
            )
            if provider_name is None:
                return None

            # Clean product-id to plain integer string
            try:
                product_id = str(int(float(row.productId)))
            except (TypeError, ValueError):
                product_id = str(row.productId).strip()
            if not product_id:
                return None

            # TV handling
            tv_package_name = getattr(row, cls._TV_SOURCE_COL, None)
            if isinstance(tv_package_name, str) and not tv_package_name.strip():
                tv_package_name = None
            tv_included = bool(getattr(row, cls._TV_INCLUDED_FLAG_COL, False))

            # Voucher handling
            voucher_type_raw: Any = getattr(row, "voucherType", None)
            voucher_value_raw: Any = getattr(row, "voucherValue", None)

            voucher_type: Optional[str] = (
                str(voucher_type_raw).strip().lower()
                if pd.notna(voucher_type_raw)
                else None
            )
            voucher_value_cents: Optional[int] = None
            voucher_value_percent: Optional[float] = None
            if pd.notna(voucher_value_raw):
                numeric_val = float(voucher_value_raw)
                if voucher_type == "percentage":
                    voucher_value_percent = numeric_val
                else:
                    voucher_value_cents = int(numeric_val)

            payload = {
                "provider_name": provider_name,
                "product_id": product_id,
                "speed_down_mbit": row.speed,
                "price_cents_month_intro": row.monthlyCostInCent,
                "price_cents_month_regular": row.afterTwoYearsMonthlyCost,
                "contract_duration_months": row.durationInMonths,
                "connection_type": row.connectionType,
                "installation_service_included": getattr(
                    row, "installationService", False
                ),
                "tv_included": tv_included,
                "tv_package_name": tv_package_name,
                "data_cap_gb": getattr(row, "limitFrom", None),
                "voucher_type": voucher_type,
                "voucher_value_cents": voucher_value_cents,
                "voucher_value_percent": voucher_value_percent,
                "max_age": getattr(row, "maxAge", None),
            }

            return ByteMeResponse(**payload)

        except Exception as exc:
            logger.error(
                f"ByteMeOfferFactory.from_tuple: failed for productId={getattr(row,'productId','?')}: {exc}",
                exc_info=True,
            )
            return None

    # ──────────────────────────────────────────────────
    # DataFrame cleaner
    # ──────────────────────────────────────────────────
    @classmethod
    def clean_df(cls, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df.copy()

        df = df.copy()

        # TV column
        if cls._TV_SOURCE_COL in df.columns:
            raw_tv = df[cls._TV_SOURCE_COL].fillna("").astype(str).str.strip()
            lower_tv = raw_tv.str.lower()
            is_true = lower_tv == "true"
            is_false = lower_tv == "false"
            is_empty = raw_tv == ""
            is_package = ~(is_true | is_false | is_empty)
            df[cls._TV_INCLUDED_FLAG_COL] = (is_true | is_package).astype(bool)
            df[cls._TV_SOURCE_COL] = raw_tv.where(is_package, None)
        else:
            df[cls._TV_INCLUDED_FLAG_COL] = False
            df[cls._TV_SOURCE_COL] = None

        # Standard booleans
        for col in cls._STANDARD_BOOL_COLS:
            if col not in df.columns:
                df[col] = False
            df[col] = (
                df[col]
                .fillna("")
                .astype(str)
                .str.strip()
                .str.lower()
                .map({"true": True, "false": False})
                .fillna(False)
                .astype(bool)
            )

        # Numeric coercion
        for col in cls._ESSENTIAL_NUMERIC_COLS + cls._OPTIONAL_NUMERIC_COLS:
            if col not in df.columns:
                df[col] = pd.NA
            df[col] = pd.to_numeric(df[col], errors="coerce")

        # Essential strings – strip + ""→None
        for col in cls._ESSENTIAL_STRING_COLS:
            if col not in df.columns:
                df[col] = None
            df[col] = (
                df[col]
                .astype(object)
                .where(pd.notna(df[col]), None)
                .apply(lambda x: x.strip() if isinstance(x, str) else x)
                .replace("", None)
            )

        # Row-level obvious filters
        mask_bad = (
            df[cls._ESSENTIAL_NUMERIC_COLS].isna().any(axis=1)
            | df[cls._ESSENTIAL_STRING_COLS].isna().any(axis=1)
            | (df["speed"] <= 0)
            | (df["monthlyCostInCent"] <= 0)
        )
        df = df[~mask_bad]

        if df.empty:
            return df

        # De-duplicate: cheapest first, but if price ties prefer rows where TV is included
        df["monthlyCostInCent"] = df["monthlyCostInCent"].astype(float)
        df = (
            df.sort_values(
                ["monthlyCostInCent", cls._TV_INCLUDED_FLAG_COL],
                ascending=[True, False],
                na_position="last",
            )
            .drop_duplicates(subset="productId", keep="first")
            .reset_index(drop=True)
        )
        return df

    # ──────────────────────────────────────────────────
    # Public helpers
    # ──────────────────────────────────────────────────
    @classmethod
    def make_responses(cls, df: pd.DataFrame) -> List[ByteMeResponse]:
        cleaned = cls.clean_df(df)
        if cleaned.empty:
            return []

        responses: List[ByteMeResponse] = []
        for row_tuple in cleaned.itertuples(index=False):
            series_row = pd.Series(data=row_tuple, index=cleaned.columns)
            resp = cls.from_tuple(series_row)
            if resp is not None:
                responses.append(resp)
        return responses

    @classmethod
    def make_offers(cls, df: pd.DataFrame, provider_name: str) -> List[Offer]:
        offers: List[Offer] = []
        for resp in cls.make_responses(df):
            try:
                offers.append(resp.to_offer(provider_name))
            except Exception as exc:
                logger.error(
                    f"ByteMeOfferFactory.make_offers: could not convert "
                    f"product_id={resp.product_id}: {exc}",
                    exc_info=True,
                )
        return offers
