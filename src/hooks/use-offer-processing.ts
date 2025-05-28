// app/compare/hooks/useOfferProcessing.ts
import { useMemo } from "react";
import { Offer } from "@/types/offer";
import { SortOptionKey } from "@/types/sort-option-key";
import { FiltersState } from "@/types/filters-state";
import { calculateAvgNetMonthlyCost } from "@/utils/calculations";
import { calculateRecommendationScore } from "@/utils/recommendation-score";

/**
 * useOfferProcessing hook
 * Processes a list of offers by enriching with calculated metrics, applying filter criteria, and sorting based on the selected option.
 *
 * @param originalOffers Array of raw offer objects to process.
 * @param sortOption Selected key that determines the sorting of offers.
 * @param filters Object representing the active filter criteria.
 * @returns Processed array of offers enriched, filtered, and ordered.
 */
// Optimize performance by caching results; re-compute when inputs change.
export const useOfferProcessing = (
    originalOffers: Offer[],
    sortOption: SortOptionKey,
    filters: FiltersState,
): Offer[] => {
    return useMemo(() => {
        if (originalOffers.length === 0) {
            return [];
        }

        // Enrichment Stage:
        // - Calculate average net monthly cost over 24 months.
        // - Compute recommendation score relative to the enriched dataset.
        const enrichedOffers = originalOffers
            .map((offer) => {
                const avgMonthlyCost24 = calculateAvgNetMonthlyCost(offer, 24);
                return {
                    ...offer,
                    avg_monthly_cost_24_months: avgMonthlyCost24,
                };
            })
            .map((offer, _, allEnriched) => ({
                ...offer,
                recommendation_score: calculateRecommendationScore(
                    offer,
                    allEnriched,
                ),
            }));

        // Filtering Stage: exclude offers that do not satisfy configured criteria.
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

        // Sorting Stage: order offers based on the selected sort option.
        switch (sortOption) {
            case "recommended":
                // Sort by recommendation score (descending).
                filtered.sort(
                    (a, b) =>
                        (b.recommendation_score ?? 0) -
                        (a.recommendation_score ?? 0),
                );
                break;
            case "price_asc":
                // Sort by average monthly cost (ascending).
                filtered.sort(
                    (a, b) =>
                        (a.avg_monthly_cost_24_months ?? Infinity) -
                        (b.avg_monthly_cost_24_months ?? Infinity),
                );
                break;
            case "speed_desc":
                // Sort by download speed (descending).
                filtered.sort((a, b) => b.speed_down_mbit - a.speed_down_mbit);
                break;
            case "duration_asc":
                // Sort by contract duration (ascending).
                filtered.sort(
                    (a, b) =>
                        a.contract_duration_months - b.contract_duration_months,
                );
                break;
            case "provider_asc":
                // Sort by provider name (alphabetical).
                filtered.sort((a, b) => a.provider.localeCompare(b.provider));
                break;
        }
        return filtered;
    }, [originalOffers, sortOption, filters]);
};
