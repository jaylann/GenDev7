// app/compare/hooks/useOfferFilters.ts
import { useState, useCallback, useMemo } from 'react';
import {FiltersState} from "@/types/filters-state";
import {DEFAULT_FILTERS} from "@/config/constants";

/**
 * Custom hook to manage offer filter state and related logic.
 * @param initialFilters - Optional initial filter state.
 * @returns An object containing filter state, setters, and derived values.
 */
export const useOfferFilters = (initialFilters: FiltersState = DEFAULT_FILTERS) => {
    const [filters, setFilters] = useState<FiltersState>(initialFilters);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filters.contractDurations.length > 0) count++;
        if (filters.connectionTypes.length > 0) count++;
        if (filters.minSpeed > 0) count++; // DEFAULT_FILTERS.minSpeed is 0
        if (filters.tvIncluded !== DEFAULT_FILTERS.tvIncluded) count++;
        if (filters.selectedProviders.length > 0) count++;
        if (filters.youthOffer !== DEFAULT_FILTERS.youthOffer) count++;
        return count;
    }, [filters]);

    const resetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, []);

    /**
     * Updates a specific filter.
     * @param filterKey - The key of the filter to update.
     * @param value - The new value for the filter.
     */
    const updateFilter = useCallback(<K extends keyof FiltersState>(filterKey: K, value: FiltersState[K]) => {
        setFilters(prev => ({ ...prev, [filterKey]: value }));
    }, []);

    return {
        filters,
        setFilters, // Expose direct setter for flexibility (e.g., URL sync)
        updateFilter,
        resetFilters,
        activeFilterCount,
    };
};