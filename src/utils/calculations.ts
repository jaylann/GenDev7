import {Offer} from "@/types/offer";
// Assuming ConnectionType is defined in "@/types/connection-type" as:
// export type ConnectionType = "DSL" | "Cable" | "Fiber" | "Mobile";
// No need to import it here if it's only used for type checking within Offer,
// but good to be mindful of its definition.

/**
 * Calculates the average monthly effective price of an offer over a specified term (default 24 months).
 * NOTE: This function is provided as part of the problem and is used as-is.
 *
 * @param {Offer} offer - The internet offer.
 * @param {number} [termInMonths=24] - The period over which to calculate the average price, default 24.
 * @returns {number} The average monthly price in cents.
 */
export const calculateEffectivePriceForSorting = (offer: Offer, termInMonths: number = 24): number => {
    const introPrice = offer.price_cents_month_intro;
    const regularPrice = offer.price_cents_month_regular ?? introPrice;
    const introDuration = offer.contract_duration_months;

    let totalNominalCost = 0;
    if (termInMonths <= introDuration) {
        totalNominalCost = introPrice * termInMonths;
    } else {
        totalNominalCost = (introPrice * introDuration) + (regularPrice * (termInMonths - introDuration));
    }

    let totalVoucherSavings = 0;
    if (offer.voucher_type && offer.voucher_value_cents != null && ['absolute', 'cashback', 'discount'].includes(offer.voucher_type)) {
        totalVoucherSavings += offer.voucher_value_cents;
    }
    if (offer.voucher_type === 'percentage' && offer.voucher_value_percent != null && offer.voucher_value_percent > 0) {
        const discountPerIntroMonth = introPrice * (offer.voucher_value_percent / 100);
        const applicableIntroMonthsInTerm = Math.min(introDuration, termInMonths);
        totalVoucherSavings += discountPerIntroMonth * applicableIntroMonthsInTerm;
    }

    let installationCost = 0;
    if (offer.installation_cost_cents != null && offer.installation_cost_cents > 0 && !offer.installation_service_included) {
        installationCost = offer.installation_cost_cents;
    }

    const effectiveTotalCost = totalNominalCost - totalVoucherSavings + installationCost;
    return effectiveTotalCost / termInMonths;
};


/**
 * Calculates a comprehensive recommendation score for an internet offer.
 * This enhanced version considers price, download/upload speeds, data caps,
 * contract duration, and various bonus features like TV inclusion, free installation,
 * youth tariffs, and connection type.
 * Higher scores indicate better overall value.
 *
 * Normalization of each factor is performed against the `allOffers` dataset.
 * The core "value" is driven by a combination of low effective price and high overall speed.
 * Data caps significantly influence the score, with unlimited or high caps being favorable.
 *
 * @param {Offer} offer - The internet offer to be scored.
 * @param {Offer[]} allOffers - An array of all available internet offers for normalization.
 * @param {number} [termInMonths=24] - The term in months for calculating effective prices.
 * @returns {number} A numeric score, typically between 0 and 1, but can exceed 1 for exceptional offers.
 */
export const calculateRecommendationScoreold = (offer: Offer, allOffers: Offer[], termInMonths: number = 24): number => {
    if (!allOffers || allOffers.length === 0) {
        console.warn("calculateRecommendationScore called with empty or null allOffers array. Returning 0.");
        return 0;
    }

    // --- Constants for Normalization and Scoring ---
    const UNLIMITED_GB_EQUIVALENT = 10000; // Assumed GB for "unlimited" data caps for normalization
    const MIN_UPLOAD_SPEED_DEFAULT = 0;   // Default upload speed if not specified

    // --- Step 1: Calculate Effective Prices for all offers ---
    const effectivePrices = allOffers.map(o => calculateEffectivePriceForSorting(o, termInMonths));
    const currentOfferEffectivePrice = calculateEffectivePriceForSorting(offer, termInMonths);

    // --- Step 2: Normalize Key Metrics ---

    // Price Score (lower is better)
    const minPrice = Math.min(...effectivePrices);
    const maxPrice = Math.max(...effectivePrices);
    let priceScore: number;
    if (maxPrice > minPrice) {
        priceScore = (maxPrice - currentOfferEffectivePrice) / (maxPrice - minPrice);
    } else {
        priceScore = (currentOfferEffectivePrice === minPrice) ? 1 : 0.5;
    }

    // Download Speed Score (higher is better)
    const downloadSpeeds = allOffers.map(o => o.speed_down_mbit);
    const minDownloadSpeed = Math.min(...downloadSpeeds);
    const maxDownloadSpeed = Math.max(...downloadSpeeds);
    let downloadSpeedScore: number;
    if (maxDownloadSpeed > minDownloadSpeed) {
        downloadSpeedScore = (offer.speed_down_mbit - minDownloadSpeed) / (maxDownloadSpeed - minDownloadSpeed);
    } else {
        downloadSpeedScore = (offer.speed_down_mbit === maxDownloadSpeed) ? 1 : 0.5;
    }

    // Upload Speed Score (higher is better)
    const uploadSpeeds = allOffers.map(o => o.speed_up_mbit ?? MIN_UPLOAD_SPEED_DEFAULT);
    const minUploadSpeed = Math.min(...uploadSpeeds);
    const maxUploadSpeed = Math.max(...uploadSpeeds);
    const currentOfferUploadSpeed = offer.speed_up_mbit ?? MIN_UPLOAD_SPEED_DEFAULT;
    let uploadSpeedScore: number;
    if (maxUploadSpeed > minUploadSpeed) {
        uploadSpeedScore = (currentOfferUploadSpeed - minUploadSpeed) / (maxUploadSpeed - minUploadSpeed);
    } else {
        uploadSpeedScore = (currentOfferUploadSpeed === maxUploadSpeed) ? 1 : 0.5;
    }

    // Data Cap Score (higher is better, null treated as UNLIMITED_GB_EQUIVALENT)
    const dataCaps = allOffers.map(o => o.data_cap_gb ?? UNLIMITED_GB_EQUIVALENT);
    const minDataCap = Math.min(...dataCaps);
    const maxDataCap = Math.max(...dataCaps);
    const currentOfferDataCap = offer.data_cap_gb ?? UNLIMITED_GB_EQUIVALENT;
    let dataCapScore: number;
    if (maxDataCap > minDataCap) {
        dataCapScore = (currentOfferDataCap - minDataCap) / (maxDataCap - minDataCap);
    } else {
        dataCapScore = (currentOfferDataCap === maxDataCap) ? 1 : 0.5;
    }
    dataCapScore = Math.max(0, dataCapScore);


    // Contract Duration Score (shorter is better)
    const durations = allOffers.map(o => o.contract_duration_months);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    let durationScore: number;
    if (maxDuration > minDuration) {
        durationScore = (maxDuration - offer.contract_duration_months) / (maxDuration - minDuration);
    } else {
        durationScore = (offer.contract_duration_months === minDuration) ? 1 : 0.5;
    }

    // --- Step 3: Combine Metrics and Define Bonuses ---

    // Overall Speed Score (weighted average of download and upload)
    const W_DOWNLOAD_SPEED_CONTRIBUTION = 0.7;
    const W_UPLOAD_SPEED_CONTRIBUTION = 0.3;
    const overallSpeedScore = (W_DOWNLOAD_SPEED_CONTRIBUTION * downloadSpeedScore) + (W_UPLOAD_SPEED_CONTRIBUTION * uploadSpeedScore);

    // Core Speed-Price Value
    const speedPriceValue = priceScore * overallSpeedScore;

    // Bonuses
    const tvIncludedBonus = offer.tv_included ? 0.05 : 0;
    const freeInstallationBonus = (offer.installation_service_included || (offer.installation_cost_cents ?? 0) === 0) ? 0.03 : 0;
    const youthTariffBonus = offer.max_age != null ? 0.02 : 0;

    let connectionTypeBonus = 0;
    // Corrected comparison for string literal type ConnectionType
    if (offer.connection_type) {
        // The `offer.connection_type` is already one of the defined string literals.
        // Using toUpperCase() for robustness if source data isn't strictly typed,
        // but ideally, the type system ensures correct casing.
        const typeNormalized = offer.connection_type.toUpperCase();
        if (typeNormalized === "FIBER") {
            connectionTypeBonus = 0.03;
        } else if (typeNormalized === "CABLE") {
            connectionTypeBonus = 0.01;
        }
        // "DSL", "Mobile", or other types get 0 bonus by default for this factor.
    }


    // --- Step 4: Define Weights for Score Components ---
    const W_SPEED_PRICE_VALUE = 0.60; // Core value driver
    const W_DATA_CAP = 0.15;          // Data cap importance
    const W_DURATION = 0.05;          // Contract flexibility

    // --- Step 5: Calculate Final Score ---
    const coreWeightedScore = (W_SPEED_PRICE_VALUE * speedPriceValue) + (W_DATA_CAP * dataCapScore) + (W_DURATION * durationScore);

    const totalBonuses = tvIncludedBonus + freeInstallationBonus + youthTariffBonus + connectionTypeBonus;

    const finalScore = coreWeightedScore + totalBonuses;

    return parseFloat(Math.max(0, finalScore).toFixed(4));
};

/**
 * v2 – Comprehensive ISP offer scorer.
 * Pure functions, exhaustive typing, SOLID-compliant.
 */

/** Normalized score in [0,1] */
type Score = number;

/** Weights (change here → behavior changes everywhere) */
export interface WeightConfig {
    cost: number;
    performance: number;
    latencyReliability: number;
    dataPolicy: number;
    contractFlexibility: number;
    perks: {
        max: number; tv: number; youth: number; freeInstall: number;
    };
}

/** Default empirically tuned weights */
export const DEFAULT_WEIGHTS: WeightConfig = {
    cost: 0.25,
    performance: 0.25,
    latencyReliability: 0.15,
    dataPolicy: 0.10,
    contractFlexibility: 0.08,
    perks: {max: 0.10, tv: 0.04, youth: 0.02, freeInstall: 0.04},
};

/** Typical latency proxies by connection type (ms) */
const CONNECTION_TYPE_LATENCY_MS: Record<Offer["connection_type"], number> = {
    Fiber: 12, Cable: 25, DSL: 40, Mobile: 35,
};

/* ---------- Helper utilities ---------- */
const clamp01 = (v: number): Score => Math.max(0, Math.min(1, v));

/** Z-score normalizer (robust against outliers) */
const zNorm = (value: number, mean: number, std: number): Score => clamp01(0.5 + (value - mean) / (6 * std)); // ±3σ → [0,1]

/* ---------- Core scoring pipeline (no provider meta) ---------- */
export function calculateRecommendationScore(offer: Offer, allOffers: Offer[], w: WeightConfig = DEFAULT_WEIGHTS, termInMonths = 24): Score {
    if (!allOffers.length) return 0;

    // 1. Gather stats
    const effPrices = allOffers.map(o => calculateEffectivePriceForSorting(o, termInMonths));
    const downSpeeds = allOffers.map(o => o.speed_down_mbit);
    const upSpeeds = allOffers.map(o => o.speed_up_mbit ?? 0);
    const contracts = allOffers.map(o => o.contract_duration_months);
    const caps = allOffers.map(o => o.data_cap_gb ?? 10_000);

    const stats = (arr: number[]) => {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length) || 1;
        return {mean, std};
    };

    // 2. Cost efficiency
    const effPrice = calculateEffectivePriceForSorting(offer, termInMonths);
    const pricePerMbps = effPrice / Math.max(offer.speed_down_mbit, 1);
    const {mean: priceMean, std: priceStd} = stats(effPrices);
    const {mean: speedMean} = stats(downSpeeds);

    const costScore = 0.6 * (1 - zNorm(effPrice, priceMean, priceStd)) + 0.4 * (1 - zNorm(pricePerMbps, speedMean ? priceMean / speedMean : priceMean, 0.01));

    // 3. Performance
    const {mean: downMean, std: downStd} = stats(downSpeeds);
    const {mean: upMean, std: upStd} = stats(upSpeeds);

    const perfScore = 0.7 * zNorm(offer.speed_down_mbit, downMean, downStd) + 0.3 * zNorm(offer.speed_up_mbit ?? 0, upMean, upStd);

    // Symmetry bonus if upload ≥40% of download
    const symmetryBonus = (offer.speed_up_mbit ?? 0) / offer.speed_down_mbit > 0.4 ? 0.05 : 0;

    // 4. Latency & reliability (only latency proxy)
    const latencyMs = CONNECTION_TYPE_LATENCY_MS[offer.connection_type];
    const latencyScore = 1 - clamp01(Math.log10(latencyMs) / Math.log10(100));

    // 5. Data policy
    const maxCap = Math.max(...caps);
    const dataScore = clamp01((offer.data_cap_gb ?? 10_000) / maxCap);

    // 6. Contract flexibility
    const {mean: durMean, std: durStd} = stats(contracts);
    const etfPenalty = Math.min(1, (15_00 * offer.contract_duration_months) / (400 * 100));
    const durationScore = 0.5 * (1 - zNorm(offer.contract_duration_months, durMean, durStd)) + 0.5 * (1 - etfPenalty);

    // 7. Perks & bonuses
    const perks = (offer.tv_included ? w.perks.tv : 0) + (offer.installation_service_included ? w.perks.freeInstall : 0) + (offer.max_age != null ? w.perks.youth : 0);

    // 8. Composite
    const finalScore = w.cost * costScore + w.performance * (perfScore + symmetryBonus) + w.latencyReliability * latencyScore + w.dataPolicy * dataScore + w.contractFlexibility * durationScore + Math.min(perks, w.perks.max);

    return +clamp01(finalScore).toFixed(4);
}
