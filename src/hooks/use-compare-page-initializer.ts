"use client";
/**
 * useComparePageInitializer Module
 *
 * Contains a custom React hook for initializing the compare page state
 * by reading URL parameters (slug, sort, filters) and fetching shared offers when needed.
 */
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import {
    DEFAULT_FILTERS,
    SORT_OPTIONS,
} from "@/config/constants";
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
 * Props for useComparePageInitializer hook.
 *
 * @property setOriginalOffers - Setter for the list of offers to display.
 * @property setSlug - Setter for the current comparison slug.
 * @property setSortOption - Setter for the selected sort option.
 * @property setFilters - Setter for the active filter state.
 * @property setStatus - Setter for status messages to show in the UI.
 * @property setLoading - Setter for the global loading flag.
 * @property setIsLoadingFromSlug - Setter for the “loading from slug” flag.
 * @property setParsedAddress - Optional setter for the pre-validated address.
 * @property setInitialAddressLabel - Optional setter for fallback address label.
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
 * Custom hook to initialize compare page based on URL search parameters.
 *
 * - Reads `slug`, `sort`, and filter parameters from the URL.
 * - If a `slug` is present, fetches shared comparison data and populates state.
 * - Otherwise, clears state and applies default sort/filters.
 *
 * @param props - Setter functions for page state and UI feedback.
 */
export const useComparePageInitializer = ({
    // Destructure setter functions for page state
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

    // Run initialization logic whenever URL search parameters change
    useEffect(() => {
        const slugFromUrl = searchParams.get("slug");
        const sortFromUrl = searchParams.get("sort") as SortOptionKey | null;
        const filtersFromUrl = deserializeFiltersFromURL(searchParams);

        /** Apply sort & filter parameters that live in the URL */
        const applyUrlParams = (): void => {
            if (
                sortFromUrl &&
                SORT_OPTIONS.some((s) => s.key === sortFromUrl)
            ) {
                setSortOption(sortFromUrl);
            }
            setFilters({ ...DEFAULT_FILTERS, ...filtersFromUrl });
        };

        // Enter global loading state, mark if loading from slug
        setIsLoadingFromSlug(!!slugFromUrl);
        setLoading(true);

        // If a shared comparison slug exists, fetch and load shared offers
        if (slugFromUrl) {
            setStatus(
                `Loading shared comparison (slug: ${slugFromUrl.slice(0, 20)}…)…`,
            );

            (async () => {
                try {
                    const res = await fetch(
                        `https://lizard-lucky-unlikely.ngrok-free.app/compare/${slugFromUrl}`,
                        {
                            headers: { Accept: "application/json" },
                            cache: "no-store",
                        },
                    );

                    if (!res.ok) {
                        // Try to surface backend error payload if any
                        const { detail } = (await res
                            .json()
                            .catch(() => ({}))) as { detail?: string };
                        throw new Error(
                            detail ?? `Backend returned ${res.status}`,
                        );
                    }

                    const data: SharedOffersResponse = await res.json();

                    // Populate offers and slug from fetched shared comparison
                    setOriginalOffers(data.offers);
                    setSlug(data.slug);

                    // full typed address (for the autocomplete input)
                    if (data.address) {
                        setParsedAddress?.(data.address);

                        // Fallback text for the rare case geocoding fails
                        setInitialAddressLabel?.(
                            `${data.address.street} ${data.address.house_number}, ` +
                                `${data.address.plz} ${data.address.city}`,
                        );
                    } else {
                        // fallback if backend stored no address on this slug
                        const shortSlug =
                            data.slug.length > 20
                                ? data.slug.slice(0, 17) + "…"
                                : data.slug;
                        setInitialAddressLabel?.(`Shared Search: ${shortSlug}`);
                        setParsedAddress?.(null);
                    }

                    setStatus(`Loaded ${data.offers.length} shared offers.`);
                    applyUrlParams();
                } catch (err: unknown) {
                    const errorMessage =
                        err instanceof Error ? err.message : String(err);
                    console.error("Error loading shared offers:", err);
                    setStatus(
                        `Error: Could not load shared comparison. ${errorMessage}. Link may be invalid or expired.`,
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
            // No slug: initialize page with default empty state and URL params
            setOriginalOffers([]);
            setSlug(null);
            setParsedAddress?.(null);
            applyUrlParams();
            // Prompt user to enter an address when no shared data is present
            setStatus("Enter an address to compare internet plans.");
            setLoading(false);
            setIsLoadingFromSlug(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);
};
