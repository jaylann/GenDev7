import { FiltersState } from "@/types/filters-state";
import {
    AVAILABLE_CONNECTION_TYPES,
    AVAILABLE_CONTRACT_DURATIONS,
} from "@/config/constants";
import { ConnectionType } from "@/types/connection-type";

/**
 * Serializes the filter state into a query string for URL sharing.
 * @param filters - The current filter state.
 * @returns A string representing the filters as URL query parameters.
 */
export const serializeFiltersForURL = (filters: FiltersState): string => {
    const params = new URLSearchParams();
    if (filters.contractDurations.length > 0)
        params.set("cd", filters.contractDurations.join(","));
    if (filters.connectionTypes.length > 0)
        params.set("ct", filters.connectionTypes.join(","));
    if (filters.minSpeed > 0) params.set("ms", String(filters.minSpeed));
    if (filters.tvIncluded !== "any") params.set("tv", filters.tvIncluded);
    if (filters.selectedProviders.length > 0)
        params.set(
            "sp",
            filters.selectedProviders.map(encodeURIComponent).join(","),
        );
    if (filters.youthOffer !== "any") params.set("yo", filters.youthOffer);
    return params.toString();
};

/**
 * Deserializes filter values from URLSearchParams.
 * @param searchParams - The URLSearchParams object from the current URL.
 * @returns A partial FiltersState object populated from the URL.
 */
export const deserializeFiltersFromURL = (
    searchParams: URLSearchParams,
): Partial<FiltersState> => {
    const loadedFilters: Partial<FiltersState> = {};
    if (searchParams.has("cd"))
        loadedFilters.contractDurations = searchParams
            .get("cd")!
            .split(",")
            .map(Number)
            .filter(
                (n) => !isNaN(n) && AVAILABLE_CONTRACT_DURATIONS.includes(n),
            );
    if (searchParams.has("ct"))
        loadedFilters.connectionTypes = searchParams
            .get("ct")!
            .split(",")
            .filter((ct) =>
                AVAILABLE_CONNECTION_TYPES.includes(ct as ConnectionType),
            ) as ConnectionType[];
    if (searchParams.has("ms")) {
        const msVal = parseInt(searchParams.get("ms")!, 10);
        if (!isNaN(msVal) && msVal >= 0) loadedFilters.minSpeed = msVal;
    }
    if (searchParams.has("tv")) {
        const tvVal = searchParams.get("tv") as FiltersState["tvIncluded"];
        if (["any", "yes", "no"].includes(tvVal))
            loadedFilters.tvIncluded = tvVal;
    }
    if (searchParams.has("sp"))
        loadedFilters.selectedProviders = searchParams
            .get("sp")!
            .split(",")
            .map(decodeURIComponent);
    if (searchParams.has("yo")) {
        const yoVal = searchParams.get("yo") as FiltersState["youthOffer"];
        if (["any", "yes"].includes(yoVal)) loadedFilters.youthOffer = yoVal;
    }
    return loadedFilters;
};
