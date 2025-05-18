/**
 * useOfferFilters Hook
 *
 * Manages state and logic for filtering offers.
 * Provides utilities for:
 *  - tracking current filter values,
 *  - computing the count of active (non-default) filters,
 *  - resetting all filters,
 *  - updating individual filter criteria.
 */
import { useCallback, useMemo, useState } from "react";
import { FiltersState } from "@/types/filters-state";
import { DEFAULT_FILTERS } from "@/config/constants";

/**
 * Custom hook to manage offer filter state and related logic.
 * @param initialFilters - Optional initial filter state.
 * @returns An object containing filter state, setters, and derived values.
 */
export const useOfferFilters = (
    initialFilters: FiltersState = DEFAULT_FILTERS,
) => {
    // Initialize filters state with optional initial values or defaults.
    const [filters, setFilters] = useState<FiltersState>(initialFilters);

    // Compute the number of active filters (non-default) for UI badges or summaries.
    const activeFilterCount = useMemo(() => {
        // Increment count for each filter group that differs from defaults.
        let count = 0;
        if (filters.contractDurations.length > 0) count++;
        if (filters.connectionTypes.length > 0) count++;
        if (filters.minSpeed > 0) count++; // DEFAULT_FILTERS.minSpeed is 0
        if (filters.tvIncluded !== DEFAULT_FILTERS.tvIncluded) count++;
        if (filters.selectedProviders.length > 0) count++;
        if (filters.youthOffer !== DEFAULT_FILTERS.youthOffer) count++;
        return count;
    }, [filters]);

    // Reset all filters back to their default values.
    const resetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, []);

    /**
     * Updates a specific filter.
     * @param filterKey - The key of the filter to update.
     * @param value - The new value for the filter.
     */
    // Generic handler to update a specific filter key with a new value.
    const updateFilter = useCallback(
        <K extends keyof FiltersState>(
            filterKey: K,
            value: FiltersState[K],
        ) => {
            setFilters((prev) => ({ ...prev, [filterKey]: value }));
        },
        [],
    );

    // Expose filter state, actions, and derived values to consuming components.
    return {
        filters,
        setFilters, // Expose direct setter for flexibility (e.g., URL sync)
        updateFilter,
        resetFilters,
        activeFilterCount,
    };
};
