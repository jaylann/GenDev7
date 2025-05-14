import {ConnectionType} from "@/types/connection-type";
import {VoucherKind} from "@/types/voucher-kind";


/**
 * Represents an internet service offer with all its details.
 */
export interface Offer {
    provider: string;
    plan_name: string;
    product_id: string;
    speed_down_mbit: number;
    speed_up_mbit?: number | null;
    price_cents_month_intro: number;
    price_cents_month_regular?: number | null;
    contract_duration_months: number;
    connection_type: ConnectionType;
    voucher_type?: VoucherKind | null;
    voucher_value_cents?: number | null;
    voucher_value_percent?: number | null;
    installation_service_included?: boolean;
    installation_cost_cents?: number | null;
    tv_included?: boolean;
    tv_package_name?: string | null;
    data_cap_gb?: number | null;
    max_age?: number | null;
    // Calculated fields
    effective_price_24_months?: number;
    recommendation_score?: number;
}