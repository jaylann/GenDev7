import {SortOptionKey} from "@/types/sort-option-key";
import {useOfferFilters} from "@/hooks/use-offer-filters";
import {serializeFiltersForURL} from "@/utils/url";


/**
 * Builds a URL string with slug and optional sort/filter parameters.
 * @param slug The base slug for the URL.
 * @param sort The current sort option.
 * @param filters The current filters.
 * @param isSingleOfferShare If true, sort/filter params are omitted.
 * @returns The constructed URL string or null if slug is null.
 */
export const buildUrl = (slug: string | null, sort: SortOptionKey, filters: ReturnType<typeof useOfferFilters>['filters'], isSingleOfferShare: boolean = false,): string | null => {
    if (!slug) return null;
    const qp = new URLSearchParams();
    qp.set('slug', slug);

    if (!isSingleOfferShare) {
        if (sort !== 'recommended') qp.set('sort', sort);
        const fq = serializeFiltersForURL(filters);
        if (fq) {
            const fp = new URLSearchParams(fq);
            fp.forEach((v, k) => qp.set(k, v));
        }
    }

    const base = typeof window !== 'undefined' && window.location.pathname.startsWith('/compare') ? '/compare' // Ensure it's just /compare, not /compare/
        : ''; // Base for other paths, ensure it doesn't create // if empty
    return `${base}?${qp.toString()}`; // Always add ? for query params
};