/**
 * Calculates the average monthly effective price of an offer over a specified term (default 24 months).
 * @param offer The internet offer.
 * @param termInMonths The period over which to calculate the average price, default 24.
 * @returns The average monthly price in cents.
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
 * Calculates a recommendation score for an offer. Higher is better.
 * @param offer The internet offer.
 * @param allOffers The list of all available offers, used for normalization.
 * @returns A numeric score.
 */
export const calculateRecommendationScore = (offer: Offer, allOffers: Offer[]): number => {
    if (allOffers.length === 0) return 0;
    const effectivePrice = calculateEffectivePriceForSorting(offer);
    const prices = allOffers.map(o => calculateEffectivePriceForSorting(o));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    let priceScore = maxPrice > minPrice ? (maxPrice - effectivePrice) / (maxPrice - minPrice) : (effectivePrice === minPrice ? 1 : 0.5);

    const speeds = allOffers.map(o => o.speed_down_mbit);
    const minSpeed = Math.min(...speeds);
    const maxSpeed = Math.max(...speeds);
    let speedScore = maxSpeed > minSpeed ? (offer.speed_down_mbit - minSpeed) / (maxSpeed - minSpeed) : (offer.speed_down_mbit === maxSpeed ? 1 : 0.5);

    const durations = allOffers.map(o => o.contract_duration_months);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    let durationScore = maxDuration > minDuration ? (maxDuration - offer.contract_duration_months) / (maxDuration - minDuration) : (offer.contract_duration_months === minDuration ? 1 : 0.5);

    const tvBonus = offer.tv_included ? 0.1 : 0;
    const freeInstallationBonus = (offer.installation_service_included || (offer.installation_cost_cents ?? 0) === 0) ? 0.05 : 0;
    const youthBonus = offer.max_age != null ? 0.03 : 0;

    const W_PRICE = 0.45;
    const W_SPEED = 0.30;
    const W_DURATION = 0.10;
    const score = (W_PRICE * priceScore) + (W_SPEED * speedScore) + (W_DURATION * durationScore) + tvBonus + freeInstallationBonus + youthBonus;
    return parseFloat(score.toFixed(4));
};