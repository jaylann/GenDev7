/****
 * Module for constructing comparison page URLs with optional sorting and filtering query parameters.
 */
import { SortOptionKey } from "@/types/sort-option-key";
import { useOfferFilters } from "@/hooks/use-offer-filters";
import { serializeFiltersForURL } from "@/utils/url";

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
