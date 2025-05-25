// app/compare/hooks/useOfferProcessing.ts
import { useMemo } from "react";
import { Offer } from "@/types/offer";
import { SortOptionKey } from "@/types/sort-option-key";
import { FiltersState } from "@/types/filters-state";
import { calculateAvgNetMonthlyCost } from "@/utils/calculations";
import { calculateRecommendationScore } from "@/utils/recommendation-score";

/**
 * Module: useOfferProcessing
 *
 * A React hook that processes a list of offers by enriching with calculated metrics,
 * applying active filters, and sorting based on the selected option.
 */
/**
 * Custom hook to process offers: enrich, filter, and sort.
 * @param originalOffers - The raw list of offers.
 * @param sortOption - The current sorting option.
 * @param filters - The current filter state.
 * @returns A list of processed (enriched, filtered, sorted) offers.
 */
// Memoizes the full processing pipeline: enrichment, filtering, and sorting.
export const useOfferProcessing = (
    originalOffers: Offer[],
    sortOption: SortOptionKey,
    filters: FiltersState,
): Offer[] => {
    return useMemo(() => {
        // Execute when originalOffers, sortOption, or filters change.
        if (originalOffers.length === 0) {
            return [];
        }

        // 1. Enrich offers (calculate avg monthly cost and recommendation score)
        const enrichedOffers = originalOffers
            // Step 1: Enrich each offer with average net monthly cost over 24 months.
            .map((offer) => {
                const avgMonthlyCost24 = calculateAvgNetMonthlyCost(offer, 24);
                return {
                    ...offer,
                    avg_monthly_cost_24_months: avgMonthlyCost24,
                };
            })
            // Then calculate recommendation score for each enriched offer.
            .map((offer, _, allEnriched) => ({
                ...offer,
                recommendation_score: calculateRecommendationScore(
                    offer,
                    allEnriched,
                ),
            }));

        // 2. Filter out offers that do not meet the user's criteria.
        const filtered = enrichedOffers.filter((offer) => {
            if (
                filters.contractDurations.length > 0 &&
                !filters.contractDurations.includes(
                    offer.contract_duration_months,
                )
            )
                return false;
            if (
                filters.connectionTypes.length > 0 &&
                !filters.connectionTypes.includes(offer.connection_type)
            )
                return false;
            if (
                filters.minSpeed > 0 &&
                offer.speed_down_mbit < filters.minSpeed
            )
                return false;
            if (filters.tvIncluded === "yes" && !offer.tv_included)
                return false;
            if (filters.tvIncluded === "no" && offer.tv_included) return false;
            if (
                filters.selectedProviders.length > 0 &&
                !filters.selectedProviders.includes(offer.provider)
            )
                return false;
            return !(filters.youthOffer === "yes" && offer.max_age == null);
        });

        // 3. Sort the remaining offers according to the selected sort option.
        switch (sortOption) {
            case "recommended":
                // Recommended: highest recommendation_score first
                filtered.sort(
                    (a, b) =>
                        (b.recommendation_score ?? 0) -
                        (a.recommendation_score ?? 0),
                );
                break;
            case "price_asc":
                // Price ascending: lowest cost first
                filtered.sort(
                    (a, b) =>
                        (a.avg_monthly_cost_24_months ?? Infinity) -
                        (b.avg_monthly_cost_24_months ?? Infinity),
                );
                break;
            case "speed_desc":
                // Speed descending: fastest connections first
                filtered.sort((a, b) => b.speed_down_mbit - a.speed_down_mbit);
                break;
            case "duration_asc":
                // Duration ascending: shortest contract first
                filtered.sort(
                    (a, b) =>
                        a.contract_duration_months - b.contract_duration_months,
                );
                break;
            case "provider_asc":
                // Provider ascending: alphabetical by provider name
                filtered.sort((a, b) => a.provider.localeCompare(b.provider));
                break;
        }
        // Return the final processed list of offers.
        return filtered;
    }, [originalOffers, sortOption, filters]);
};
