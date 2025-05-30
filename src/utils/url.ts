/**
 * URL Filter Serialization Module
 *
 * Provides utility functions to serialize and deserialize FiltersState
 * to and from URL query parameters for sharing and persistence.
 */
import { FiltersState } from "@/types/filters-state";
import {
    AVAILABLE_CONNECTION_TYPES,
    AVAILABLE_CONTRACT_DURATIONS,
} from "@/config/constants";
import { ConnectionType } from "@/types/connection-type";
import { SortOptionKey } from "@/types/sort-option-key";
import { useOfferFilters } from "@/hooks/use-offer-filters";

/**
 * Serializes the filter state into a query string for URL sharing.
 * @param filters - The current filter state.
 * @returns A string representing the filters as URL query parameters.
 */
export const serializeFiltersForURL = (filters: FiltersState): string => {
    // Initialize query parameters container
    const params = new URLSearchParams();
    // Include selected contract durations (comma-separated)
    if (filters.contractDurations.length > 0)
        params.set("cd", filters.contractDurations.join(","));
    // Include selected connection types (comma-separated)
    if (filters.connectionTypes.length > 0)
        params.set("ct", filters.connectionTypes.join(","));
    // Include minimum speed threshold
    if (filters.minSpeed > 0) params.set("ms", String(filters.minSpeed));
    // Include TV inclusion preference if specified
    if (filters.tvIncluded !== "any") params.set("tv", filters.tvIncluded);
    // Include selected providers, URL-encoded and comma-separated
    if (filters.selectedProviders.length > 0)
        params.set(
            "sp",
            filters.selectedProviders.map(encodeURIComponent).join(","),
        );
    // Include youth offer preference if specified
    if (filters.youthOffer !== "any") params.set("yo", filters.youthOffer);
    return params.toString();
};

/**
 * Extracts the 'slug' query parameter from the provided URL.
 * @param url - The URL string to parse, absolute or relative.
 * @returns The 'slug' parameter value, or null if not present.
 */
export const extractSlug = (url: string): string | null => {
    try {
        // Use a base URL if the provided URL is relative to handle path-only URLs correctly
        const fullUrl = new URL(
            url,
            typeof window !== "undefined"
                ? window.location.origin
                : "http://localhost",
        );
        return fullUrl.searchParams.get("slug");
    } catch (e) {
        console.error(`[extractSlug] Error parsing URL: ${url}`, e); // Optional: might be too noisy
        return null;
    }
};

/**
 * Generates a canonical URL for a comparison page, typically including only the 'slug' query parameter.
 * Ensures that the URL points to the root path with the slug.
 * @param rawUrl - The raw URL string, which may contain various query parameters.
 * @returns A canonical URL string (e.g., "/?slug=some-slug") or the original URL if no slug is found.
 */
export const getCanonicalCompareURL = (rawUrl: string): string => {
    const slug = extractSlug(rawUrl);
    // If no slug, return the rawUrl as it might be a different kind of link.
    return slug ? `/?slug=${slug}` : rawUrl;
};

/**
 * Deserializes filter values from URLSearchParams.
 * @param searchParams - The URLSearchParams object from the current URL.
 * @returns A partial FiltersState object populated from the URL.
 */
export const deserializeFiltersFromURL = (
    searchParams: URLSearchParams,
): Partial<FiltersState> => {
    // Prepare an object to accumulate validated filter values
    const loadedFilters: Partial<FiltersState> = {};
    // Parse and validate contract durations from "cd" parameter
    if (searchParams.has("cd"))
        loadedFilters.contractDurations = searchParams
            .get("cd")!
            .split(",")
            .map(Number)
            .filter(
                (n) => !isNaN(n) && AVAILABLE_CONTRACT_DURATIONS.includes(n),
            );
    // Parse and validate connection types from "ct" parameter
    if (searchParams.has("ct"))
        loadedFilters.connectionTypes = searchParams
            .get("ct")!
            .split(",")
            .filter((ct) =>
                AVAILABLE_CONNECTION_TYPES.includes(ct as ConnectionType),
            ) as ConnectionType[];
    // Parse and validate minimum speed from "ms" parameter
    if (searchParams.has("ms")) {
        const msVal = parseInt(searchParams.get("ms")!, 10);
        if (!isNaN(msVal) && msVal >= 0) loadedFilters.minSpeed = msVal;
    }
    // Parse and validate TV inclusion from "tv" parameter
    if (searchParams.has("tv")) {
        const tvVal = searchParams.get("tv") as FiltersState["tvIncluded"];
        if (["any", "yes", "no"].includes(tvVal))
            loadedFilters.tvIncluded = tvVal;
    }
    // Parse and decode selected providers from "sp" parameter
    if (searchParams.has("sp"))
        loadedFilters.selectedProviders = searchParams
            .get("sp")!
            .split(",")
            .map(decodeURIComponent);
    // Parse and validate youth offer preference from "yo" parameter
    if (searchParams.has("yo")) {
        const yoVal = searchParams.get("yo") as FiltersState["youthOffer"];
        if (["any", "yes"].includes(yoVal)) loadedFilters.youthOffer = yoVal;
    }
    return loadedFilters;
};

/**
 * Builds a URL string with slug and optional sort/filter parameters.
 * Returns null if no slug is provided.
 *
 * @param slug               The base slug for the URL.
 * @param sort               The current sort option key.
 * @param filters            The current set of filters from useOfferFilters.
 * @param isSingleOfferShare If true, omits sort and filter parameters for single-offer sharing.
 * @returns                  The constructed URL string or null if slug is null.
 */
export const buildUrl = (
    slug: string | null,
    sort: SortOptionKey,
    filters: ReturnType<typeof useOfferFilters>["filters"],
    isSingleOfferShare: boolean = false,
): string | null => {
    // Short-circuit: no URL to build if slug is missing
    if (!slug) return null;

    // Initialize query parameters container
    const qp = new URLSearchParams();
    qp.set("slug", slug);

    // Include sort and filter params only when sharing multiple offers
    if (!isSingleOfferShare) {
        // Append sort parameter when it's not the default 'recommended'
        if (sort !== "recommended") qp.set("sort", sort);

        // Serialize the active filters into query-string format
        const fq = serializeFiltersForURL(filters);

        // Add each serialized filter key/value pair to the query parameters
        if (fq) {
            const fp = new URLSearchParams(fq);
            fp.forEach((v, k) => qp.set(k, v));
        }
    }

    // Determine the base path: use '/compare' to maintain correct routing context
    const base =
        typeof window !== "undefined" &&
        window.location.pathname.startsWith("/compare")
            ? "/compare" // Ensure it's just /compare, not /compare/
            : ""; // Base for other paths, ensure it doesn't create // if empty

    // Construct and return the full URL with serialized query parameters
    return `${base}?${qp.toString()}`; // Always add ? for query params
};
