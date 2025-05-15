from __future__ import annotations
from __future__ import annotations

from typing import List, Optional, Final, Any

import pandas as pd
from loguru import logger

from ..models import Offer
from ..models.providers.byteme_response import ByteMeResponse


class ByteMeOfferFactory:
    """
    Factory class for creating Offer objects from ByteMe provider data.
    Handles cleaning, transformation, and parsing of raw data (typically from a CSV),
    adhering to the structure defined by ByteMeResponse Pydantic model.
    """

    # --- Configuration Constants ---
    # Columns that are essential and numeric. Rows with missing/invalid values in these cols will be dropped.
    # These are considered essential for a minimally valid offer *and* for non-optional Pydantic fields.
    _ESSENTIAL_NUMERIC_COLS: Final[List[str]] = [
        "productId",
        "speed",
        "monthlyCostInCent",
        "afterTwoYearsMonthlyCost", # Now essential due to strict Pydantic ByteMeResponse model
        "durationInMonths",         # Now essential due to strict Pydantic ByteMeResponse model
    ]
    # Optional numeric columns. Missing values will be parsed as None if Pydantic field is Optional.
    _OPTIONAL_NUMERIC_COLS: Final[List[str]] = [
        "limitFrom",    # Corresponds to data_cap_gb
        "voucherValue", # Value part of voucher, type determined by voucherType
        "maxAge",
    ]
    # Essential string columns. Rows with missing values will be dropped.
    _ESSENTIAL_STRING_COLS: Final[List[str]] = [
        "connectionType", # Now essential due to strict Pydantic ByteMeResponse model
    ]

    # Standard boolean columns to be mapped from "true"/"false" strings.
    _STANDARD_BOOL_COLS: Final[List[str]] = ["installationService"]

    _PROVIDER_NAME_COL: Final[str] = "providerName"
    _TV_SOURCE_COL: Final[str] = "tv" # Original column name for TV data from CSV
    _TV_INCLUDED_FLAG_COL: Final[str] = "_tv_is_included_internal_" # Temp column for boolean TV inclusion


    @classmethod
    def _parse_optional_int(cls, value: Any) -> Optional[int]:
        """Safely parse a value to an optional integer."""
        return int(value) if pd.notna(value) else None

    @classmethod
    def from_tuple(cls, row: pd.Series) -> Optional[ByteMeResponse]:
        """
        Convert a pandas Series (representing a row from the cleaned DataFrame)
        into a ByteMeResponse object.

        Args:
            row: A pandas Series containing the data for a single offer.
                   Expected to have columns processed by `clean_df` to meet Pydantic requirements.

        Returns:
            A ByteMeResponse object if the row data is valid and can be parsed according to the Pydantic model,
            otherwise None (e.g., if Pydantic validation fails despite cleaning).
        """
        # Essential fields like 'monthlyCostInCent' are guaranteed by clean_df.

        # Process providerName: truncate at the first comma
        provider_name_full: str = str(getattr(row, cls._PROVIDER_NAME_COL, "")).strip()
        processed_provider_name: str = provider_name_full.split(',', 1)[0].strip()

        # TV data:
        # cls._TV_SOURCE_COL ('tv') column holds the package name (str or None) after clean_df.
        # cls._TV_INCLUDED_FLAG_COL holds the boolean inclusion flag.
        tv_package_name_str: Optional[str] = getattr(row, cls._TV_SOURCE_COL, None)
        if isinstance(tv_package_name_str, str) and not tv_package_name_str.strip(): # Ensure empty strings are None
            tv_package_name_str = None
        tv_is_included_bool: bool = bool(getattr(row, cls._TV_INCLUDED_FLAG_COL, False))

        # Voucher processing
        voucher_type_input: Any = getattr(row, "voucherType", None)
        voucher_value_input: Any = getattr(row, "voucherValue", None) # Already numeric from clean_df, or NaN

        final_voucher_type_str: Optional[str] = None
        final_voucher_value_cents: Optional[int] = None
        final_voucher_value_percent: Optional[float] = None

        if pd.notna(voucher_type_input):
            final_voucher_type_str = str(voucher_type_input).strip().lower()

        if pd.notna(voucher_value_input): # A voucher value is present
            # voucher_value_input is already numeric (float by default from to_numeric) or NaN
            numeric_voucher_value: float = float(voucher_value_input)

            if final_voucher_type_str == "percentage":
                try:
                    final_voucher_value_percent = numeric_voucher_value # Store the percentage value (e.g., 12.0 for 12%)
                except (ValueError, TypeError): # Should not happen if voucher_value_input is numeric
                    logger.warning(
                        f"ProductId {getattr(row, 'productId', 'Unknown')}: "
                        f"Could not parse voucherValue '{voucher_value_input}' as float for voucherType 'percentage'."
                    )
                    final_voucher_type_str = None # Invalidate type if value parsing fails
            elif final_voucher_type_str: # Type is present and not 'percentage', assume cents
                try:
                    final_voucher_value_cents = int(numeric_voucher_value)
                except (ValueError, TypeError):
                    logger.warning(
                        f"ProductId {getattr(row, 'productId', 'Unknown')}: "
                        f"Could not parse voucherValue '{voucher_value_input}' as int for voucherType '{final_voucher_type_str}'."
                    )
                    final_voucher_type_str = None # Invalidate type
            else: # No voucher type specified, but a value exists. Assume it's cents.
                try:
                    final_voucher_value_cents = int(numeric_voucher_value)
                except (ValueError, TypeError):
                    logger.warning(
                        f"ProductId {getattr(row, 'productId', 'Unknown')}: "
                        f"Could not parse voucherValue '{voucher_value_input}' as int (voucherType missing)."
                    )
                    # final_voucher_type_str is already None

        try:
            # Construct the ByteMeResponse object.
            # Fields marked as non-optional in Pydantic model are cast directly,
            # relying on clean_df to ensure they are present and valid.
            response_data = {
                "provider_name": processed_provider_name,
                "product_id": str(int(row.productId)),
                "speed_down_mbit": int(round(row.speed)),
                "price_cents_month_intro": int(row.monthlyCostInCent),
                "price_cents_month_regular": int(row.afterTwoYearsMonthlyCost), # Non-optional in Pydantic
                "contract_duration_months": int(row.durationInMonths),      # Non-optional in Pydantic
                "connection_type": str(row.connectionType).strip(),                   # Non-optional in Pydantic
                "installation_service_included": bool(getattr(row, "installationService", False)),
                "tv_included": tv_is_included_bool,
                "tv_package_name": tv_package_name_str,
                "data_cap_gb": cls._parse_optional_int(getattr(row, "limitFrom", None)),
                "voucher_type": final_voucher_type_str,
                "voucher_value_cents": final_voucher_value_cents,
                "voucher_value_percent": final_voucher_value_percent,
                "max_age": cls._parse_optional_int(getattr(row, "maxAge", None)),
            }
            return ByteMeResponse(**response_data)

        except (TypeError, ValueError, AttributeError) as e: # Catch direct conversion errors
            logger.error(
                f"Error preparing data for ByteMeResponse for productId {getattr(row, 'productId', 'Unknown')}: {e}. Row data: {row.to_dict()}",
                exc_info=True
            )
            return None
        except Exception as e: # Catch Pydantic validation errors or other unexpected issues
            # Pydantic's ValidationError is the specific one for validation issues.
            # Catching general Exception here for broader safety.
            logger.error(
                f"Pydantic validation or other error creating ByteMeResponse for productId {getattr(row, 'productId', 'Unknown')}: {e}. Prepared data: {response_data if 'response_data' in locals() else 'unavailable'}",
                exc_info=True
            )
            return None

    @classmethod
    def clean_df(cls, df: pd.DataFrame) -> pd.DataFrame:
        """
        Sanitise a raw DataFrame from the ByteMe provider.

        Operations:
        1. Handles 'tv' column: Extracts TV package name and boolean inclusion flag.
        2. Converts standard boolean columns to booleans.
        3. Converts numeric columns to numeric types, coercing errors to NaN.
        4. Filters out rows with missing essential data (numeric or string) or invalid values
           (e.g., non-positive speed/price), ensuring compliance with non-optional Pydantic fields.
        5. Deduplicates offers by 'productId', keeping the cheapest valid one.

        Args:
            df: The raw pandas DataFrame.

        Returns:
            A cleaned pandas DataFrame. Returns an empty DataFrame if input is empty or all rows are filtered.
        """
        if df.empty:
            logger.info("ByteMeOfferFactory.clean_df: Input DataFrame is empty.")
            return df.copy()

        cleaned_df = df.copy()

        # 1. Special handling for the 'tv' column (cls._TV_SOURCE_COL)
        if cls._TV_SOURCE_COL in cleaned_df.columns:
            original_tv_values: pd.Series = cleaned_df[cls._TV_SOURCE_COL].fillna('').astype(str).str.strip()
            lowered_tv_values: pd.Series = original_tv_values.str.lower()
            is_true_str: pd.Series = lowered_tv_values == "true"
            is_false_str: pd.Series = lowered_tv_values == "false"
            is_empty_str: pd.Series = original_tv_values == ""
            is_package_name: pd.Series = ~(is_true_str | is_false_str | is_empty_str)
            cleaned_df[cls._TV_INCLUDED_FLAG_COL] = (is_true_str | is_package_name).astype(bool)
            cleaned_df[cls._TV_SOURCE_COL] = original_tv_values.where(is_package_name, None)
        else:
            logger.warning(f"TV column '{cls._TV_SOURCE_COL}' not found. Defaulting TV status.")
            cleaned_df[cls._TV_INCLUDED_FLAG_COL] = False
            cleaned_df[cls._TV_SOURCE_COL] = None

        # 2. Process standard boolean columns
        for col_name in cls._STANDARD_BOOL_COLS:
            if col_name in cleaned_df.columns:
                mapped_bool_series: pd.Series = (
                    cleaned_df[col_name].fillna('').astype(str).str.strip().str.lower()
                    .map({"true": True, "false": False})
                )
                cleaned_df[col_name] = mapped_bool_series.fillna(False).astype(bool)
            else:
                logger.warning(f"Standard boolean column '{col_name}' not found. Adding with default False.")
                cleaned_df[col_name] = False

        # 3. Convert numeric columns (both essential and optional)
        all_numeric_cols: List[str] = cls._ESSENTIAL_NUMERIC_COLS + cls._OPTIONAL_NUMERIC_COLS
        for col_name in all_numeric_cols:
            if col_name in cleaned_df.columns:
                cleaned_df[col_name] = pd.to_numeric(cleaned_df[col_name], errors="coerce")
            else:
                logger.warning(f"Numeric column '{col_name}' not found. Adding with pd.NA.")
                cleaned_df[col_name] = pd.NA

        # Ensure essential string columns exist, fill missing with None (they will be checked for NaNs later)
        for col_name in cls._ESSENTIAL_STRING_COLS:
            if col_name not in cleaned_df.columns:
                logger.warning(f"Essential string column '{col_name}' not found. Adding with None.")
                cleaned_df[col_name] = None # Will be pd.NA implicitly if object dtype
            else: # Ensure they are string type, handling NaNs
                cleaned_df[col_name] = cleaned_df[col_name].astype(object).where(pd.notna(cleaned_df[col_name]), None)


        # 4. Discard malformed rows
        initial_row_count: int = len(cleaned_df)

        # Condition: Essential numeric columns must not be NaN.
        cond_missing_essential_numeric: pd.Series = cleaned_df[cls._ESSENTIAL_NUMERIC_COLS].isna().any(axis=1)

        # Condition: Essential string columns must not be NaN/None.
        cond_missing_essential_strings: pd.Series = cleaned_df[cls._ESSENTIAL_STRING_COLS].isna().any(axis=1)

        cond_zero_or_neg: pd.Series = pd.Series(False, index=cleaned_df.index)
        positive_check_cols = [col for col in ["speed", "monthlyCostInCent"] if col in cleaned_df.columns and cleaned_df[col].notna().any()]
        if positive_check_cols:
            # Compare only non-NaN values to 0 to avoid warnings/errors with pd.NA
            temp_check_df = cleaned_df[positive_check_cols].copy()
            for col in positive_check_cols: # Apply check per column to handle pd.NA correctly
                cond_zero_or_neg |= (temp_check_df[col].notna() & (temp_check_df[col] <= 0))

        cond_speed_too_low: pd.Series = pd.Series(False, index=cleaned_df.index)
        if "speed" in cleaned_df.columns and cleaned_df["speed"].notna().any():
            cond_speed_too_low = cleaned_df["speed"].notna() & (cleaned_df["speed"] < 1)

        rows_to_drop: pd.Series = cond_missing_essential_numeric | cond_missing_essential_strings | cond_zero_or_neg | cond_speed_too_low
        cleaned_df = cleaned_df[~rows_to_drop]

        num_dropped: int = initial_row_count - len(cleaned_df)
        if num_dropped > 0:
            logger.debug(f"ByteMeOfferFactory.clean_df: Dropped {num_dropped} malformed/incomplete rows. Kept {len(cleaned_df)} rows.")

        if cleaned_df.empty:
            logger.info("ByteMeOfferFactory.clean_df: DataFrame is empty after filtering.")
            return cleaned_df

        # 5. Deduplicate: Keep the cheapest offer for each 'productId'
        if "productId" in cleaned_df.columns and "monthlyCostInCent" in cleaned_df.columns:
            # Ensure monthlyCostInCent is float for proper NaN handling in sort
            cleaned_df["monthlyCostInCent"] = cleaned_df["monthlyCostInCent"].astype(float)
            cleaned_df = (
                cleaned_df.sort_values("monthlyCostInCent", ascending=True, na_position='last')
                .drop_duplicates(subset="productId", keep="first")
                .reset_index(drop=True)
            )
        # ... (logging for missing productId or monthlyCostInCent for deduplication omitted for brevity but can be added)

        return cleaned_df

    @classmethod
    def make_responses(cls, df: pd.DataFrame) -> List[ByteMeResponse]:
        """
        Converts a DataFrame of raw ByteMe offer data into a list of ByteMeResponse objects.
        It first cleans the DataFrame using `clean_df`.

        Args:
            df: The raw pandas DataFrame containing ByteMe offer data.

        Returns:
            A list of ByteMeResponse objects. Empty if input is empty or all rows are invalid.
        """
        cleaned_df: pd.DataFrame = cls.clean_df(df)
        if cleaned_df.empty:
            logger.info("ByteMeOfferFactory.make_responses: No valid data after cleaning, returning empty list.")
            return []

        responses: List[ByteMeResponse] = []
        for row_tuple in cleaned_df.itertuples(index=False):
            row_series: pd.Series = pd.Series(data=row_tuple, index=cleaned_df.columns)
            response_obj: Optional[ByteMeResponse] = cls.from_tuple(row_series)
            if response_obj:
                responses.append(response_obj)

        logger.info(f"ByteMeOfferFactory.make_responses: Successfully created {len(responses)} ByteMeResponse objects.")
        return responses

    @classmethod
    def make_offers(cls, df: pd.DataFrame, provider_name: str) -> List[Offer]:
        """
        Converts a DataFrame of raw ByteMe offer data into a list of generic Offer objects.
        This involves creating ByteMeResponse objects first, then converting them.

        Args:
            df: The raw pandas DataFrame.
            provider_name: The canonical provider name to be associated with the created Offer objects
                           (used as `Offer.provider`).

        Returns:
            A list of Offer objects.
        """
        byte_me_responses: List[ByteMeResponse] = cls.make_responses(df)
        if not byte_me_responses:
            logger.info("ByteMeOfferFactory.make_offers: No ByteMeResponse objects created, returning empty list of Offers.")
            return []

        offers: List[Offer] = []
        for resp in byte_me_responses:
            try:
                # Pass the canonical provider name to to_offer.
                # ByteMeResponse.provider_name (derived from CSV) will be used as Offer.plan_name.
                offers.append(resp.to_offer(provider_name=provider_name))
            except Exception as e:
                product_id_val = getattr(resp, 'product_id', 'Unknown Product ID')
                logger.error(
                    f"Failed to convert ByteMeResponse (product_id: {product_id_val}) to Offer: {e}",
                    exc_info=True
                )

        logger.info(f"ByteMeOfferFactory.make_offers: Successfully created {len(offers)} Offer objects for provider '{provider_name}'.")
        return offers