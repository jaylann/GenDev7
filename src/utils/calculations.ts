import {Offer} from "@/types/offer";
import {VoucherKind} from "@/types/voucher-kind";
import {ConnectionType} from "@/types/connection-type";

/**
 * Determines the duration of the introductory price in months.
 * If an introductory price (`price_cents_month_intro`) is present, its duration
 * is taken from `contract_regular_months` (which defaults to 12 in the Pydantic model
 * if not explicitly provided). This field indicates the length of the initial contract term
 * that often aligns with a promotional price period.
 *
 * @param offer - The offer object.
 * @returns The duration of the introductory price in months. Returns 0 if no intro price is applicable.
 * @example
 * // Offer with intro price and contract_regular_months = 6 -> returns 6
 * // Offer with intro price and contract_regular_months = null (Pydantic default 12) -> returns 12
 * // Offer without intro price -> returns 0
 */
export const getIntroPriceDurationMonths = (offer: Offer): number => {
    if (offer.price_cents_month_intro != null && offer.price_cents_month_intro > 0) {
        // `contract_regular_months` from Pydantic has a default of 12.
        // This field defines the duration for which the intro price is typically valid.
        return offer.contract_regular_months ?? 12;
    }
    return 0;
};

/**
 * Calculates the gross total cost of an offer over a specified calculation period.
 * This function considers both introductory and regular monthly prices and their respective durations.
 *
 * @param offer - The offer object, containing pricing and contract details.
 * @param calculationPeriodMonths - The total period (in months) over which to calculate the cost.
 * @returns The gross total cost in cents, or `null` if essential price information is missing.
 * @example
 * // Offer: intro 20€ for 6m, regular 40€. Period: 24m.
 * // Cost = (2000 * 6) + (4000 * 18) = 12000 + 72000 = 84000 cents.
 */
export const calculateGrossTotalCostOverDynamicPeriod = (offer: Offer, calculationPeriodMonths: number): number | null => {
    const {price_cents_month_intro, price_cents_month_regular} = offer;
    const introDuration = getIntroPriceDurationMonths(offer);

    let totalCost = 0;

    if (price_cents_month_intro != null) {
        // If regular price is not set, assume intro price continues (or use a fallback if defined).
        // Pydantic ensures at least one price, so if intro exists, regular can be null.
        const effectiveRegularPrice = price_cents_month_regular ?? price_cents_month_intro;

        if (introDuration >= calculationPeriodMonths) {
            // Entire calculation period is covered by intro price.
            totalCost = price_cents_month_intro * calculationPeriodMonths;
        } else {
            // Part intro price, part regular price.
            totalCost = (price_cents_month_intro * introDuration) + (effectiveRegularPrice * (calculationPeriodMonths - introDuration));
        }
    } else if (price_cents_month_regular != null) {
        // No intro price, only regular price applies for the whole period.
        totalCost = price_cents_month_regular * calculationPeriodMonths;
    } else {
        // This case should ideally not be reached if the Pydantic model ensures
        // that at least one price (intro or regular) is always present.
        console.warn(`Offer ${offer.product_id} has no valid price information.`);
        return null;
    }
    return Math.round(totalCost); // Ensure integer cents
};


/**
 * Computes the average net monthly cost over a given period.
 *
 * @param offer - The offer containing pricing and voucher details.
 * @param periodMonths - The number of months over which to average.
 * @returns The rounded average net monthly cost in cents, or null if unavailable.
 */
export function calculateAvgNetMonthlyCost(offer: Offer, periodMonths: number): number | null {
    const grossTotalCost = calculateGrossTotalCostOverDynamicPeriod(offer, periodMonths);
    if (grossTotalCost == null) return null;

    const voucherValue = calculateEffectiveVoucherValue(offer, periodMonths);
    const netTotalCost = Math.max(0, grossTotalCost - voucherValue);
    return Math.round(netTotalCost / periodMonths);
}

/**
 * Calculates the total effective monetary value of a voucher in cents.
 * This function considers the voucher type, its nominal value (cents or percent),
 * any maximum value cap (`voucher_max_value_cents`), and maximum runtime
 * (`voucher_max_runtime_months`). For percentage vouchers, it applies the discount
 * iteratively against monthly tariff prices (intro or regular).
 *
 * Note: `voucher_min_order_value_cents` is a pre-condition for voucher applicability
 * and is assumed to be checked elsewhere before calling this calculation.
 *
 * @param offer - The offer object, including all voucher-related fields and pricing.
 * @param calculationPeriodMonths - The overall period (in months) for which the average
 *                                  cost (and thus voucher impact) is being assessed.
 *                                  The voucher's own runtime limits take precedence if shorter.
 * @returns The total effective voucher value in cents, rounded to the nearest cent.
 */
export const calculateEffectiveVoucherValue = (offer: Offer, calculationPeriodMonths: number): number => {
    if (!offer.voucher_type) {
        return 0; // No voucher, no value.
    }

    let totalVoucherValueApplied = 0;
    const overallMaxCapCents = offer.voucher_max_value_cents ?? Infinity;
    const introPriceDuration = getIntroPriceDurationMonths(offer);

    switch (offer.voucher_type) {
        case VoucherKind.ABSOLUTE:
        case VoucherKind.CASHBACK:
            // These are typically one-time, fixed-amount vouchers.
            // Their face value is `voucher_value_cents`.
            // `voucher_max_runtime_months` is usually not applicable here, assumed to be a one-off.
            totalVoucherValueApplied = offer.voucher_value_cents ?? 0;
            // The value is then capped by `voucher_max_value_cents`.
            totalVoucherValueApplied = Math.min(totalVoucherValueApplied, overallMaxCapCents);
            break;

        case VoucherKind.PERCENTAGE:
            if (offer.voucher_value_percent != null && offer.voucher_value_percent > 0) {
                const percentOff = offer.voucher_value_percent / 100;

                // Determine the effective number of months the percentage voucher applies.
                // It's the minimum of its own max runtime, or the overall calculation period.
                const voucherEffectiveMonths = Math.min(offer.voucher_max_runtime_months ?? calculationPeriodMonths, calculationPeriodMonths);

                for (let month = 0; month < voucherEffectiveMonths; month++) {
                    if (totalVoucherValueApplied >= overallMaxCapCents) {
                        break; // Stop if the overall cap for the voucher has been reached.
                    }

                    let currentMonthlyPrice: number;
                    // Determine price for the current month (intro or regular).
                    if (month < introPriceDuration && offer.price_cents_month_intro != null) {
                        currentMonthlyPrice = offer.price_cents_month_intro;
                    } else if (offer.price_cents_month_regular != null) {
                        currentMonthlyPrice = offer.price_cents_month_regular;
                    } else if (offer.price_cents_month_intro != null) {
                        // Fallback: if regular price is null but intro price existed and intro period ended.
                        currentMonthlyPrice = offer.price_cents_month_intro;
                    } else {
                        // No valid price for this month, skip discount calculation.
                        // This should be rare with validated offer data.
                        continue;
                    }

                    if (currentMonthlyPrice > 0) {
                        const discountThisMonth = currentMonthlyPrice * percentOff;
                        // The discount applied this month cannot exceed the remaining room under the overall cap.
                        const applicableDiscountThisMonth = Math.min(discountThisMonth, overallMaxCapCents - totalVoucherValueApplied);
                        totalVoucherValueApplied += applicableDiscountThisMonth;
                    }
                }
            }
            break;

        case VoucherKind.DISCOUNT:
            // Generic discount. Its behavior depends on which value fields are populated.
            // Per Pydantic validator, if `voucher_value_percent` is set, type becomes PERCENTAGE.
            // So, `DISCOUNT` type usually implies `voucher_value_cents` or a non-standard mechanism.
            // For robustness, we check both possibilities if type is explicitly `DISCOUNT`.
            if (offer.voucher_value_cents != null) {
                // Behaves like an ABSOLUTE voucher.
                totalVoucherValueApplied = offer.voucher_value_cents;
                totalVoucherValueApplied = Math.min(totalVoucherValueApplied, overallMaxCapCents);
            } else if (offer.voucher_value_percent != null && offer.voucher_value_percent > 0) {
                // Behaves like a PERCENTAGE voucher (re-use logic, could be refactored).
                const percentOff = offer.voucher_value_percent / 100;
                const voucherEffectiveMonths = Math.min(offer.voucher_max_runtime_months ?? calculationPeriodMonths, calculationPeriodMonths);
                for (let month = 0; month < voucherEffectiveMonths; month++) {
                    if (totalVoucherValueApplied >= overallMaxCapCents) break;
                    let currentMonthlyPrice: number;
                    if (month < introPriceDuration && offer.price_cents_month_intro != null) {
                        currentMonthlyPrice = offer.price_cents_month_intro;
                    } else if (offer.price_cents_month_regular != null) {
                        currentMonthlyPrice = offer.price_cents_month_regular;
                    } else if (offer.price_cents_month_intro != null) {
                        currentMonthlyPrice = offer.price_cents_month_intro;
                    } else {
                        continue;
                    }
                    if (currentMonthlyPrice > 0) {
                        const discountThisMonth = currentMonthlyPrice * percentOff;
                        const applicableDiscountThisMonth = Math.min(discountThisMonth, overallMaxCapCents - totalVoucherValueApplied);
                        totalVoucherValueApplied += applicableDiscountThisMonth;
                    }
                }
            }
            // If neither cents nor percent value is present for DISCOUNT, value remains 0.
            break;

        default:
            // This ensures all VoucherKind cases are handled.
            // If a new VoucherKind is added without updating this switch, TypeScript will error.
            const _exhaustiveCheck: never = offer.voucher_type;
            console.warn(`Unknown voucher type encountered: ${_exhaustiveCheck}`);
            return 0;
    }

    // Ensure the final value is non-negative and rounded to the nearest cent.
    return Math.max(0, Math.round(totalVoucherValueApplied));
};
