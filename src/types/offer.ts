// src/models/offer.model.ts

import { ConnectionType } from "@/types/connection-type";
import { VoucherKind } from "./voucher-kind";

/**
 * Represents a single internet tariff/plan that can be shown to the user.
 * This interface is meticulously aligned with the backend Pydantic `Offer` model.
 * All monetary values are in EUR-cents (integers).
 */
export interface Offer {
    // --- Identification -----------------------------------------------------
    /** Company selling the tariff (e.g., "ByteMe") */
    provider: string;
    /** Marketing / commercial name of the plan (e.g., "Ultra 70", "Premium 200 Young") */
    plan_name: string;
    /** Provider-internal identifier (e.g., "501", "PROD-1234") */
    product_id: string;

    // --- Performance --------------------------------------------------------
    /** Advertised downstream rate in Mbit/s. This is a required positive integer. */
    speed_down_mbit: number;
    /**
     * Monthly data cap in GB.
     * `null` or `undefined` indicates a flat rate (unlimited data).
     * Corresponds to Pydantic `Optional[PositiveInt]`.
     */
    data_cap_gb?: number | null;
    /**
     * Physical access medium. This is a required field.
     * Corresponds to Pydantic `Literal["DSL", "Cable", "Fiber", "Mobile"]`.
     */
    connection_type: ConnectionType;

    // --- Commercials --------------------------------------------------------
    /**
     * Price per month in EUR-cents during the initial term / promotional period.
     * `null` or `undefined` if not applicable.
     * Corresponds to Pydantic `Optional[PositiveInt]`.
     * Note: Backend ensures at least one price (intro or regular) is present.
     */
    price_cents_month_intro?: number | null;
    /**
     * Price per month in EUR-cents after the introductory price expires.
     * `null` or `undefined` if not applicable.
     * Corresponds to Pydantic `Optional[PositiveInt]`.
     */
    price_cents_month_regular?: number | null;
    /** Minimum contract term in months. This is a required positive integer. */
    contract_duration_months: number;
    /**
     * Regular contract duration in months after the promotional period, if different.
     * Defaults to 12 on the backend if not specified.
     * Corresponds to Pydantic `Optional[PositiveInt]`.
     */
    contract_regular_months?: number | null;
    /**
     * True if an on-site technician visit for installation is included free of charge.
     * Backend defaults to `false`. This field will always be a boolean.
     */
    installation_service_included: boolean;

    // --- TV & Media ---------------------------------------------------------
    /**
     * True if any TV product is bundled with the offer.
     * Backend derives this from `tv_package_name` or an explicit value, ensuring it's always a boolean.
     */
    tv_included: boolean;
    /**
     * Name of the bundled TV option (e.g., "ByteLive Basic", "Ping TV Plus").
     * `null` or `undefined` if no TV package is named.
     * Corresponds to Pydantic `Optional[str]`.
     */
    tv_package_name?: string | null;

    // --- Promotions & Audience ---------------------------------------------
    /**
     * Kind of voucher or incentive offered.
     * `null` or `undefined` if no voucher is applicable.
     * Backend may derive this (e.g., set to `PERCENTAGE` if `voucher_value_percent` is present).
     * Corresponds to Pydantic `Optional[VoucherKind]`.
     */
    voucher_type?: VoucherKind | null;
    /**
     * Face value in EUR-cents for `ABSOLUTE` or `CASHBACK` voucher types.
     * `null` or `undefined` if not applicable.
     * Corresponds to Pydantic `Optional[PositiveInt]`.
     */
    voucher_value_cents?: number | null;
    /**
     * Discount percentage (0–100) for `PERCENTAGE` voucher types.
     * `null` or `undefined` if not applicable.
     * Corresponds to Pydantic `Optional[NonNegativeFloat]`.
     */
    voucher_value_percent?: number | null;
    /**
     * Minimum order value in EUR-cents required to use the voucher.
     * `null` or `undefined` if not applicable.
     * Corresponds to Pydantic `Optional[PositiveInt]`.
     */
    voucher_min_order_value_cents?: number | null;
    /**
     * Maximum value of the voucher in EUR-cents (e.g., for percentage discounts with a cap).
     * `null` or `undefined` if not applicable.
     * Corresponds to Pydantic `Optional[PositiveInt]`.
     */
    voucher_max_value_cents?: number | null;
    /**
     * Maximum runtime of the voucher in months.
     * `null` or `undefined` if not applicable or indefinite.
     * Corresponds to Pydantic `Optional[PositiveInt]`.
     */
    voucher_max_runtime_months?: number | null;
    /**
     * Upper age limit for special youth / student tariffs.
     * `null` or `undefined` if the tariff is not age-restricted.
     * Corresponds to Pydantic `Optional[PositiveInt]`.
     */
    max_age?: number | null;
}
