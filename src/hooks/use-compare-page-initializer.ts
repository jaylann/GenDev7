import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { API_BASE_URL, DEFAULT_FILTERS, SORT_OPTIONS } from "@/config/constants";
import { deserializeFiltersFromURL } from "@/utils/url";

import type { Offer } from "@/types/offer";
import type { Address } from "@/types/address";
import type { SortOptionKey } from "@/types/sort-option-key";
import type { FiltersState } from "@/types/filters-state";

interface SharedOffersResponse {
    slug: string;
    offers: Offer[];
    address?: Address;
}

/**
 * Props expected by {@link useComparePageInitializer}
 */
export interface UseComparePageInitializerProps {
    setOriginalOffers: (offers: Offer[]) => void;
    setSlug: (slug: string | null) => void;
    setSortOption: (sort: SortOptionKey) => void;
    setFilters: (filters: FiltersState) => void;
    setStatus: (message: string) => void;
    setLoading: (loading: boolean) => void;
    setIsLoadingFromSlug: (loading: boolean) => void;

    /**
     *  If the consumer needs the _pre-validated_ address for the UI,
     *  supply a setter here (optional for backward-compat).
     */
    setParsedAddress?: (addr: Address | null) => void;

    /**  Optional pre-fill text if geocoding fails or is skipped. */
    setInitialAddressLabel?: (label: string) => void;
}

/**
 * Reads `slug`, `sort`, and filter params from the URL and initialises page state.
 * – If `slug` is present it fetches the shared comparison and derived address.
 * – All setters are **stable** (`useState`) so they are safe to leave out of deps.
 */
export const useComparePageInitializer = ({
                                              setOriginalOffers,
                                              setSlug,
                                              setSortOption,
                                              setFilters,
                                              setStatus,
                                              setLoading,
                                              setIsLoadingFromSlug,
                                              setParsedAddress,
                                              setInitialAddressLabel,
                                          }: UseComparePageInitializerProps): void => {
    const searchParams = useSearchParams();

    useEffect(() => {
        const slugFromUrl = searchParams.get("slug");
        const sortFromUrl = searchParams.get("sort") as SortOptionKey | null;
        const filtersFromUrl = deserializeFiltersFromURL(searchParams);

        /** Apply sort & filter params that live in the URL */
        const applyUrlParams = (): void => {
            if (sortFromUrl && SORT_OPTIONS.some((s) => s.key === sortFromUrl)) {
                setSortOption(sortFromUrl);
            }
            setFilters({ ...DEFAULT_FILTERS, ...filtersFromUrl });
        };

        // ---------------------------------------------------------------------
        // 1.  Global “I’m loading” flags
        // ---------------------------------------------------------------------
        setIsLoadingFromSlug(!!slugFromUrl);
        setLoading(true);

        // ---------------------------------------------------------------------
        // 2.  Process “shared link” or plain page
        // ---------------------------------------------------------------------
        if (slugFromUrl) {
            setStatus(`Loading shared comparison (slug: ${slugFromUrl.slice(0, 20)}…)…`);

            (async () => {
                try {
                    const res = await fetch(`${API_BASE_URL}/compare/${slugFromUrl}`, {
                        headers: { Accept: "application/json" },
                        cache: "no-store",
                    });

                    if (!res.ok) {
                        // Try to surface backend error payload if any
                        const { detail } = (await res.json().catch(() => ({}))) as { detail?: string };
                        throw new Error(detail ?? `Backend returned ${res.status}`);
                    }

                    const data: SharedOffersResponse = await res.json();

                    // ---------------- results ----------------
                    setOriginalOffers(data.offers);
                    setSlug(data.slug);

                    // full typed address (for the autocomplete input)
                    if (data.address) {
                        setParsedAddress?.(data.address);

                        // Fallback text for the rare case geocoding fails
                        setInitialAddressLabel?.(
                            `${data.address.street} ${data.address.house_number}, ` +
                            `${data.address.plz} ${data.address.city}`
                        );
                    } else {
                        // fallback if backend stored no address on this slug
                        const shortSlug = data.slug.length > 20 ? data.slug.slice(0, 17) + "…" : data.slug;
                        setInitialAddressLabel?.(`Shared Search: ${shortSlug}`);
                        setParsedAddress?.(null);
                    }

                    setStatus(`Loaded ${data.offers.length} shared offers.`);
                    applyUrlParams();
                } catch (err: any) {
                    console.error("Error loading shared offers:", err);
                    setStatus(
                        `Error: Could not load shared comparison. ${err.message}. ` +
                        `Link may be invalid or expired.`
                    );

                    // Clean-up state so UI returns to an empty page
                    setOriginalOffers([]);
                    setSlug(null);
                    setParsedAddress?.(null);
                    applyUrlParams();
                } finally {
                    setLoading(false);
                    setIsLoadingFromSlug(false);
                }
            })();
        } else {
            //--------------------------------------------------------------------
            //  No slug → just normal page initialisation
            //--------------------------------------------------------------------
            setOriginalOffers([]);
            setSlug(null);
            setParsedAddress?.(null);
            applyUrlParams();
            setStatus("Enter an address to compare internet plans.");
            setLoading(false);
            setIsLoadingFromSlug(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);
};
