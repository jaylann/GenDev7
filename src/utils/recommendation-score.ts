/**
 * recommendation-score Module
 *
 * Provides a data-driven recommendation score for broadband offers, combining cost,
 * promotion value, performance, and extras into a single normalized score between 0 and 1.
 * Utilizes utility functions for cost and voucher calculations and empirical weights
 * derived from consumer research.
 *
 * **Update May 2025**
 * - Added **bang‑for‑buck** metric (Mbps per €) to explicitly reward cost‑efficient speed.
 * - Introduced a mild penalty multiplier for plans advertising < 100 Mbps downstream.
 * - Re‑balanced weightings so the new dimension fits while total weight remains 1.
 * - All existing comments kept intact; new explanations appended where relevant.
 */
import { ConnectionType } from "@/types/connection-type";
import { Offer } from "@/types/offer";
import {
    calculateEffectiveVoucherValue,
    calculateGrossTotalCostOverDynamicPeriod,
} from "@/utils/calculations";

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
 *    - Plans below 100 Mbps receive a dedicated penalty multiplier (see **LOW_SPEED_PENALTY**) so
 *      that they are down‑weighted beyond simple normalisation.
 *
 * 4. **Bang for your buck (Mbps / €)**  ← *NEW*
 *    - Calculates the ratio of advertised downstream Mbps to effective monthly price, rewarding
 *      plans that deliver more speed per euro.
 *    - Normalised independently so that efficiency, not absolute speed or price alone, is measured.
 *
 * 5. **Connection quality**
 *    - Applies empirical multipliers for each medium (Fiber > Cable > DSL > Mobile) to reflect
 *      real-world reliability and latency differences.
 *
 * 6. **Extras & constraints**
 *    - Data cap: treats unlimited as best (1), otherwise normalises capped plans.
 *    - Installation: free on-site service scores 1, otherwise 0.
 *    - TV bundle: bundled TV scores 1, otherwise 0.
 *    - Age restrictions: unrestricted plans score 1, student/youth-only plans score 0.
 *
 * 7. **Weighted aggregation**
 *    - Each dimension is weighted according to multi-source consumer-research (price, speed and
 *      bang‑for‑buck being most important after this update).
 *    - Weighted scores are summed and clamped to [0, 1], producing the final recommendation value.
 *
 * By cleanly separating cost, promotion, performance, perks, and efficiency—and by re-using your
 * existing pricing helpers to avoid duplicated logic—this approach yields a transparent, tunable,
 * and data-driven recommendation that aligns with how real users choose broadband plans.
 */

/**
 * Empirical connection-quality multipliers.
 *
 * Higher values reflect more reliable and lower-latency connection types.
 */
const CONNECTION_QUALITY: Record<ConnectionType, number> = {
    Fiber: 1,
    Cable: 0.8,
    DSL: 0.6,
    Mobile: 0.4,
};

/**
 * Weighted importance of each score dimension.
 *
 * Values derived from multi-source consumer research, ensuring price, speed and efficiency
 * have the greatest influence. The sum of all weights equals 1.
 */
const WEIGHTS = {
    price: 0.30,
    bangForBuck: 0.08, // Mbps per € efficiency
    speed: 0.26,
    connection: 0.15,
    voucher: 0.07,
    dataCap: 0.05,
    installation: 0.05,
    tvBundle: 0.02,
    ageFlex: 0.02,
} as const;

/**
 * Evaluation horizon in months.
 *
 * Defines the period over which cost and voucher values are normalized.
 */
const TERM_MONTHS = 24;

/**
 * Multiplier applied to the normalised speed score for plans advertising < 100 Mbps.
 * Keeps penalty mild (0.85) so that truly cheap sub‑100 offers can still compete.
 */
const LOW_SPEED_PENALTY = 0.85;

interface Range {
    min: number;
    max: number;
}

/**
 * Normalizes a value within a given range to [0, 1].
 *
 * @param value            The raw metric value.
 * @param range            The min and max across all offers.
 * @param higherIsBetter   If false, lower raw values yield higher normalized scores.
 * @returns Normalized score between 0 and 1.
 */
const normalize = (
    value: number,
    { min, max }: Range,
    higherIsBetter = true,
): number => {
    if (max === min) return 1;
    const ratio = (value - min) / (max - min);
    return higherIsBetter ? ratio : 1 - ratio;
};

/**
 * Calculates a composite recommendation score for a single offer.
 *
 * - Computes cross-offer ranges for each dimension (cost, speed, bang‑for‑buck, voucher, data cap).
 * - Scores the current offer on each metric via normalization and empirical constants.
 * - Aggregates dimension scores using weighted sum and clamps result to [0, 1].
 *
 * @param offer      The broadband offer to evaluate.
 * @param allOffers  The full set of offers for range calculations.
 * @returns A score between 0 (worst) and 1 (best).
 */
export function calculateRecommendationScore(
    offer: Offer,
    allOffers: Offer[],
): number {
    /* ---------- pre-compute cross-offer ranges --------------------------- */
    // Monthly price across offers (excluding promotions)
    const pricePerMonthList = allOffers.map((o) => {
        const total = calculateGrossTotalCostOverDynamicPeriod(o, TERM_MONTHS);
        return total == null ? Number.POSITIVE_INFINITY : total / TERM_MONTHS;
    });
    const priceRange: Range = {
        min: Math.min(...pricePerMonthList),
        max: Math.max(...pricePerMonthList),
    };

    // Advertised downstream speed across offers
    const speedRange: Range = {
        min: Math.min(...allOffers.map((o) => o.speed_down_mbit)),
        max: Math.max(...allOffers.map((o) => o.speed_down_mbit)),
    };

    // Data cap values across offers
    const dataCapVals = allOffers.map(
        (o) => o.data_cap_gb ?? Number.POSITIVE_INFINITY,
    );
    const dataCapRange: Range = {
        min: Math.min(...dataCapVals.filter(Number.isFinite)),
        max: Math.max(...dataCapVals),
    };

    // Voucher value per month across offers
    const voucherVals = allOffers.map(
        (o) => calculateEffectiveVoucherValue(o, TERM_MONTHS) / TERM_MONTHS,
    );
    const voucherRange: Range = {
        min: Math.min(...voucherVals),
        max: Math.max(...voucherVals),
    };

    // Bang‑for‑buck (Mbps/€) across offers
    const bangForBuckList = allOffers.map((o, idx) => {
        const priceMonthly = pricePerMonthList[idx];
        return !isFinite(priceMonthly) || priceMonthly === 0
            ? 0
            : o.speed_down_mbit / priceMonthly;
    });
    const bangRange: Range = {
        min: Math.min(...bangForBuckList),
        max: Math.max(...bangForBuckList),
    };

    /* ---------- metric scores for *this* offer --------------------------- */
    const baseCost = calculateGrossTotalCostOverDynamicPeriod(offer, TERM_MONTHS);
    const priceMonthly =
        baseCost == null ? Number.POSITIVE_INFINITY : baseCost / TERM_MONTHS;

    // 1. Price score: lower monthly cost yields a higher score
    const priceScore = normalize(priceMonthly, priceRange, false);

    // 2. Speed score with <100 Mbps penalty
    const rawSpeedScore = normalize(offer.speed_down_mbit, speedRange);
    const speedScore =
        offer.speed_down_mbit < 100
            ? rawSpeedScore * LOW_SPEED_PENALTY
            : rawSpeedScore;

    // 3. Bang‑for‑buck score (Mbps per €)
    const bangMetric =
        !isFinite(priceMonthly) || priceMonthly === 0
            ? 0
            : offer.speed_down_mbit / priceMonthly;
    const bangScore = normalize(bangMetric, bangRange);

    // 4. Connection quality from empirical multipliers
    const connectionScore = CONNECTION_QUALITY[offer.connection_type];

    // 5. Data cap score: unlimited best, otherwise normalized
    const dataCapScore =
        offer.data_cap_gb == null
            ? 1
            : normalize(offer.data_cap_gb, dataCapRange);

    // 6. Installation score: free service yields full points
    const installationScore = offer.installation_service_included ? 1 : 0;

    // 7. Voucher score: normalised promotional value
    const voucherPerMonth =
        calculateEffectiveVoucherValue(offer, TERM_MONTHS) / TERM_MONTHS;
    const voucherScore =
        voucherRange.max > 0 ? normalize(voucherPerMonth, voucherRange) : 0;

    // 8. TV bundle score: included yields full points
    const tvScore = offer.tv_included ? 1 : 0;

    // 9. Age flexibility score: unrestricted yields full points
    const ageFlexScore = offer.max_age == null ? 1 : 0;

    /* ---------- weighted aggregation ------------------------------------- */
    const final =
        priceScore * WEIGHTS.price +
        bangScore * WEIGHTS.bangForBuck +
        speedScore * WEIGHTS.speed +
        connectionScore * WEIGHTS.connection +
        voucherScore * WEIGHTS.voucher +
        dataCapScore * WEIGHTS.dataCap +
        installationScore * WEIGHTS.installation +
        tvScore * WEIGHTS.tvBundle +
        ageFlexScore * WEIGHTS.ageFlex;

    return Math.min(1, Math.max(0, parseFloat(final.toFixed(4))));
}
