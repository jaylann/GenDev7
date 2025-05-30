/**
 * React hook for managing offer filters.
 *
 * This hook encapsulates filter state, provides mechanisms for updating and
 * resetting filters, and computes the count of active filters.
 */
import { useCallback, useMemo, useState } from "react";
import { FiltersState } from "@/types/filters-state";
import { DEFAULT_FILTERS } from "@/config/constants";

/**
 * Initializes and returns offer filter controls and state.
 *
 * @param initialFilters - Initial filter values; defaults to DEFAULT_FILTERS.
 * @returns An object containing:
 *   - filters: Current filter values.
 *   - setFilters: State setter for filters.
 *   - updateFilter: Function to update an individual filter.
 *   - resetFilters: Function to restore default filter values.
 *   - activeFilterCount: Number of filters currently applied.
 */
export const useOfferFilters = (
    initialFilters: FiltersState = DEFAULT_FILTERS,
) => {
    /**
     * Initializes filter state with provided or default values.
     */
    const [filters, setFilters] = useState<FiltersState>(initialFilters);

    /**
     * Computes the number of filters that differ from default settings.
     * Includes defensive coding to prevent errors with malformed filter state.
     */
    const activeFilterCount = useMemo(() => {
        // Guard against missing or malformed filters
        if (!filters) return 0;

        let count = 0;

        // Check if arrays exist before checking their length
        if (
            Array.isArray(filters.contractDurations) &&
            filters.contractDurations.length > 0
        )
            count++;
        if (
            Array.isArray(filters.connectionTypes) &&
            filters.connectionTypes.length > 0
        )
            count++;
        if (
            Array.isArray(filters.selectedProviders) &&
            filters.selectedProviders.length > 0
        )
            count++;

        // Check if numeric values are actually numbers
        if (typeof filters.minSpeed === "number" && filters.minSpeed > 0)
            count++;

        // Check if boolean values exist before comparison
        if (
            typeof filters.tvIncluded === "boolean" &&
            filters.tvIncluded !== DEFAULT_FILTERS.tvIncluded
        )
            count++;
        if (
            typeof filters.youthOffer === "boolean" &&
            filters.youthOffer !== DEFAULT_FILTERS.youthOffer
        )
            count++;

        return count;
    }, [filters]);

    /**
     * Restores all filters to their default values.
     */
    const resetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, []);

    /**
     * Updates a specific filter in the state.
     *
     * @template K - Key of the filter to update.
     * @param filterKey - The filter property to modify.
     * @param value - New value for the specified filter.
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
