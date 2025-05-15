import { ConnectionType } from "./connection-type";
import {VoucherKind} from "@/types/voucher-kind";

/**
 * Represents an internet service offer with all its details,
 * aligned with the Pydantic model.
 * All monetary values are in cent-accurate integers (EUR-cent).
 */
export interface Offer {
    // --- Identification -----------------------------------------------------
    /** Company selling the tariff (e.g., "ByteMe") */
    provider: string;
    /** Marketing / commercial name of the plan (e.g., "Ultra 70") */
    plan_name: string;
    /** Provider-internal identifier (e.g., "501", "PROD-1234") */
    product_id: string;

    // --- Performance --------------------------------------------------------
    /** Advertised downstream rate (Mbit/s) */
    speed_down_mbit?: number | null;
    /** Monthly data cap in GB (null or undefined means flat rate) */
    data_cap_gb?: number | null;
    /** Physical access medium */
    connection_type?: ConnectionType | null;

    // --- Commercials --------------------------------------------------------
    /** Price per month during the initial term / promo period (EUR-cents) */
    price_cents_month_intro?: number | null;
    /** Price per month after intro price expires (EUR-cents) */
    price_cents_month_regular?: number | null;
    /** Minimum contract term in months */
    contract_duration_months?: number | null;
    /** Regular contract duration in months (after promo period) */
    contract_regular_months?: number | null; // New field

    /** True if an on-site technician visit for installation is free */
    installation_service_included?: boolean | null;
    /** One-off setup / activation fee in EUR-cents (if not included) */
    installation_cost_cents?: number | null;

    // --- TV & Media ---------------------------------------------------------
    /** True if any TV product is bundled */
    tv_included?: boolean | null;
    /** Name of bundled TV option (e.g., "ByteLive Basic") */
    tv_package_name?: string | null;

    // --- Promotions & Audience ---------------------------------------------
    /** Kind of voucher / incentive */
    voucher_type?: VoucherKind | null;
    /** Face value in EUR-cents for absolute voucher types */
    voucher_value_cents?: number | null;
    /** Discount percentage (0 – 100) */
    voucher_value_percent?: number | null; // Pydantic 'float' is 'number' in TS
    /** Minimum order value in EUR-cents required to use the voucher */
    voucher_min_order_value_cents?: number | null; // New field
    /** Maximum value of the voucher in EUR-cents */
    voucher_max_value_cents?: number | null; // New field

    /** Upper age limit for special youth / student tariffs */
    max_age?: number | null;
}