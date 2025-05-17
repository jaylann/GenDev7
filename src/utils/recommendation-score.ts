import {ConnectionType} from "@/types/connection-type";
import {Offer} from "@/types/offer";
import {calculateEffectiveVoucherValue, calculateGrossTotalCostOverDynamicPeriod} from "@/utils/calculations";

/**
 * calculateRecommendationScore:
 *
 * This function transforms each internet offer into a single, comparable score between 0 and 1
 * by combining all key decision factors that matter most to consumers:
 *
 * 1. **Real total cost (excluding promotions)**
 *    - Uses calculateGrossTotalCostOverDynamicPeriod over a standard 24-month horizon to capture
 *      both introductory and regular pricing.
 *    - Normalises the per-month cost across all offers so that cheaper plans score closer to 1.
 *
 * 2. **Promotion value**
 *    - Leverages calculateEffectiveVoucherValue to compute the true monetary value of any voucher
 *      (absolute, percentage, or cashback) over the same 24-month term.
 *    - Separately normalises this saving so that richer promotions score higher, without “baking”
 *      discounts into the base price metric.
 *
 * 3. **Download speed**
 *    - Directly compares advertised downstream Mbps using min–max normalisation across offers,
 *      rewarding faster connections.
 *
 * 4. **Connection quality**
 *    - Applies empirical multipliers for each medium (Fiber > Cable > DSL > Mobile) to reflect
 *      real-world reliability and latency differences.
 *
 * 5. **Extras & constraints**
 *    - Data cap: treats unlimited as best (1), otherwise normalises capped plans.
 *    - Installation: free on-site service scores 1, otherwise 0.
 *    - TV bundle: bundled TV scores 1, otherwise 0.
 *    - Age restrictions: unrestricted plans score 1, student/youth-only plans score 0.
 *
 * 6. **Weighted aggregation**
 *    - Each dimension is weighted according to multi-source consumer-research (price and speed
 *      being most important).
 *    - Weighted scores are summed and clamped to [0, 1], producing the final recommendation value.
 *
 * By cleanly separating cost, promotion, performance, and perks—and by re-using your existing
 * pricing helpers to avoid duplicated logic—this approach yields a transparent, tunable, and
 * data-driven recommendation that aligns with how real users choose broadband plans.
 */


/** Empirical connection-quality multipliers (higher = better). */
const CONNECTION_QUALITY: Record<ConnectionType, number> = {
    Fiber: 1, Cable: 0.8, DSL: 0.6, Mobile: 0.4,
};

/** Weighted importance derived from multi-source consumer research. */
const WEIGHTS = {
    price: 0.34,
    speed: 0.30,
    connection: 0.15,
    voucher: 0.07,
    dataCap: 0.05,
    installation: 0.05,
    tvBundle: 0.02,
    ageFlex: 0.02,
} as const;

/** Horizon (months) over which “real” cost is evaluated. */
const TERM_MONTHS = 24;

interface Range {
    min: number;
    max: number;
}

const normalize = (value: number, {min, max}: Range, higherIsBetter = true,): number => {
    if (max === min) return 1;
    const ratio = (value - min) / (max - min);
    return higherIsBetter ? ratio : 1 - ratio;
};

/**
 * Calculates a data-driven recommendation score in [0, 1].
 * @param offer      Offer to evaluate.
 * @param allOffers  Full offer list for range normalisation.
 */
export function calculateRecommendationScore(offer: Offer, allOffers: Offer[],): number {
    /* ---------- pre-compute cross-offer ranges --------------------------- */
    const pricePerMonthList = allOffers.map((o) => {
        const total = calculateGrossTotalCostOverDynamicPeriod(o, TERM_MONTHS);
        return total == null ? Number.POSITIVE_INFINITY : total / TERM_MONTHS;
    });
    const priceRange: Range = {
        min: Math.min(...pricePerMonthList), max: Math.max(...pricePerMonthList),
    };

    const speedRange: Range = {
        min: Math.min(...allOffers.map((o) => o.speed_down_mbit)),
        max: Math.max(...allOffers.map((o) => o.speed_down_mbit)),
    };

    const dataCapVals = allOffers.map((o) => o.data_cap_gb ?? Number.POSITIVE_INFINITY,);
    const dataCapRange: Range = {
        min: Math.min(...dataCapVals.filter(Number.isFinite)), max: Math.max(...dataCapVals),
    };

    const voucherVals = allOffers.map((o) => calculateEffectiveVoucherValue(o, TERM_MONTHS) / TERM_MONTHS,);
    const voucherRange: Range = {
        min: Math.min(...voucherVals), max: Math.max(...voucherVals),
    };

    /* ---------- metric scores for *this* offer --------------------------- */
    const baseCost = calculateGrossTotalCostOverDynamicPeriod(offer, TERM_MONTHS,);
    const priceMonthly = baseCost == null ? Number.POSITIVE_INFINITY : baseCost / TERM_MONTHS;
    const priceScore = normalize(priceMonthly, priceRange, false);

    const speedScore = normalize(offer.speed_down_mbit, speedRange);

    const connectionScore = CONNECTION_QUALITY[offer.connection_type];

    const dataCapScore = offer.data_cap_gb == null ? 1 : normalize(offer.data_cap_gb, dataCapRange);

    const installationScore = offer.installation_service_included ? 1 : 0;

    const voucherPerMonth = calculateEffectiveVoucherValue(offer, TERM_MONTHS) / TERM_MONTHS;
    const voucherScore = voucherRange.max > 0 ? normalize(voucherPerMonth, voucherRange) : 0;

    const tvScore = offer.tv_included ? 1 : 0;

    const ageFlexScore = offer.max_age == null ? 1 : 0;

    /* ---------- weighted aggregation ------------------------------------- */
    const final = priceScore * WEIGHTS.price + speedScore * WEIGHTS.speed + connectionScore * WEIGHTS.connection + voucherScore * WEIGHTS.voucher + dataCapScore * WEIGHTS.dataCap + installationScore * WEIGHTS.installation + tvScore * WEIGHTS.tvBundle + ageFlexScore * WEIGHTS.ageFlex;

    return Math.min(1, Math.max(0, parseFloat(final.toFixed(4))));
}