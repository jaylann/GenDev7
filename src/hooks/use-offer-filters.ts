/**
 * Custom React hook managing offer filter state and related logic.
 * Provides state management, update/reset actions, and active filter computations.
 */
import { useCallback, useMemo, useState } from "react";
import { FiltersState } from "@/types/filters-state";
import { DEFAULT_FILTERS } from "@/config/constants";

/**
 * Hook to manage offer filter state and related logic.
 *
 * @param initialFilters - Optional initial filter state, defaults to DEFAULT_FILTERS.
 * @returns An object containing:
 *   - filters: current filter state,
 *   - setFilters: direct setter for filter state,
 *   - updateFilter: function to update individual filter keys,
 *   - resetFilters: function to reset filters to defaults,
 *   - activeFilterCount: number of non-default filters.
 */
export const useOfferFilters = (
    initialFilters: FiltersState = DEFAULT_FILTERS,
) => {
    /**
     * Initializes filter state with provided or default values.
     */
    const [filters, setFilters] = useState<FiltersState>(initialFilters);

    /**
     * Computes the count of active (non-default) filters.
     */
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

    /**
     * Resets all filters to their default values.
     */
    const resetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, []);

    /**
     * Updates a specific filter.
     * @param filterKey - The key of the filter to update.
     * @param value - The new value for the filter.
     */
    const updateFilter = useCallback(
        <K extends keyof FiltersState>(
            filterKey: K,
            value: FiltersState[K],
        ) => {
            setFilters((prev) => ({ ...prev, [filterKey]: value }));
        },
        [],
    );

    return {
        filters,
        setFilters, // Expose direct setter for flexibility (e.g., URL sync)
        updateFilter,
        resetFilters,
        activeFilterCount,
    };
};
