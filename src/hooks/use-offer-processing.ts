// app/compare/hooks/useOfferProcessing.ts
import {useMemo} from 'react';
import {Offer} from "@/types/offer";
import {SortOptionKey} from "@/types/sort-option-key";
import {FiltersState} from "@/types/filters-state";
import {calculateEffectivePriceForSorting, calculateRecommendationScore} from "@/utils/calculations";

/**
 * Custom hook to process offers: enrich, filter, and sort.
 * @param originalOffers - The raw list of offers.
 * @param sortOption - The current sorting option.
 * @param filters - The current filter state.
 * @returns A list of processed (enriched, filtered, sorted) offers.
 */
export const useOfferProcessing = (originalOffers: Offer[], sortOption: SortOptionKey, filters: FiltersState): Offer[] => {
    const processedOffers = useMemo(() => {
        if (originalOffers.length === 0) {
            return [];
        }

        // 1. Enrich offers (calculate effective price and recommendation score)
        const enrichedOffers = originalOffers
            .map(offer => ({
                ...offer, effective_price_24_months: calculateEffectivePriceForSorting(offer),
            }))
            .map((offer, _, allEnriched) => ({
                ...offer, recommendation_score: calculateRecommendationScore(offer, allEnriched),
            }));

        // 2. Filter offers
        let filtered = [...enrichedOffers].filter(offer => {
            if (filters.contractDurations.length > 0 && !filters.contractDurations.includes(offer.contract_duration_months)) return false;
            if (filters.connectionTypes.length > 0 && !filters.connectionTypes.includes(offer.connection_type)) return false;
            if (filters.minSpeed > 0 && offer.speed_down_mbit < filters.minSpeed) return false;
            if (filters.tvIncluded === 'yes' && !offer.tv_included) return false;
            if (filters.tvIncluded === 'no' && offer.tv_included) return false;
            if (filters.selectedProviders.length > 0 && !filters.selectedProviders.includes(offer.provider)) return false;
            if (filters.youthOffer === 'yes' && offer.max_age == null) return false; // Only show youth offers
            // Note: If youthOffer is 'any', no filtering on max_age. If 'no', this is not explicitly handled yet.
            // The original code implies 'yes' means "is a youth offer", 'any' means "don't care".
            // To explicitly filter *out* youth offers for 'no', add:
            // if (filters.youthOffer === 'no' && offer.max_age != null) return false;
            return true;
        });

        // 3. Sort offers
        switch (sortOption) {
            case 'recommended':
                filtered.sort((a, b) => (b.recommendation_score ?? 0) - (a.recommendation_score ?? 0));
                break;
            case 'price_asc':
                filtered.sort((a, b) => (a.effective_price_24_months ?? Infinity) - (b.effective_price_24_months ?? Infinity));
                break;
            case 'speed_desc':
                filtered.sort((a, b) => b.speed_down_mbit - a.speed_down_mbit);
                break;
            case 'duration_asc':
                filtered.sort((a, b) => a.contract_duration_months - b.contract_duration_months);
                break;
            case 'provider_asc':
                filtered.sort((a, b) => a.provider.localeCompare(b.provider));
                break;
        }
        return filtered;
    }, [originalOffers, sortOption, filters]);

    return processedOffers;
};