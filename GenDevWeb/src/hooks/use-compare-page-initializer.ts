"use client";
/**
 * Custom React hook for initializing the compare page state from URL parameters and shared offers.
 * Parses slug, sort, and filters; fetches and populates comparison data if a slug is present.
 */
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import {
    DEFAULT_FILTERS,
    SORT_OPTIONS,
    API_BASE_URL,
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
 * @property setOriginalOffersAction - Sets the list of comparison offers.
 * @property setSlugAction - Sets the comparison slug.
 * @property setSortOptionAction - Sets the selected sort option.
 * @property setFiltersAction - Sets the current filter state.
 * @property setStatusAction - Sets status messages for the UI.
 * @property setLoadingAction - Toggles the global loading flag.
 * @property setIsLoadingFromSlugAction - Toggles the "loading from slug" indicator.
 * @property setParsedAddress - Optional: sets the parsed address object.
 * @property setInitialAddressLabel - Optional: sets fallback address label text.
 */
export interface UseComparePageInitializerProps {
    setOriginalOffersAction: (offers: Offer[]) => void;
    setSlugAction: (slug: string | null) => void;
    setSortOptionAction: (sort: SortOptionKey) => void;
    setFiltersAction: (filters: FiltersState) => void;
    setStatusAction: (message: string) => void;
    setLoadingAction: (loading: boolean) => void;
    setIsLoadingFromSlugAction: (loading: boolean) => void;

    /**
     *  If the consumer needs the _pre-validated_ address for the UI,
     *  supply a setter here (optional for backward-compat).
     */
    setParsedAddress?: (addr: Address | null) => void;

    /**  Optional pre-fill text if geocoding fails or is skipped. */
    setInitialAddressLabel?: (label: string) => void;
}

/**
 * Hook to initialize compare page based on URL search parameters.
 *
 * Reads slug, sort, and filter parameters from the URL. When a slug is present,
 * fetches shared comparison data and updates state; otherwise applies defaults.
 *
 * @param props - Setter callbacks for page state and UI feedback.
 */
export const useComparePageInitializer = ({
    // Destructure setter functions for page state
    setOriginalOffersAction,
    setSlugAction,
    setSortOptionAction,
    setFiltersAction,
    setStatusAction,
    setLoadingAction,
    setIsLoadingFromSlugAction,
    setParsedAddress,
    setInitialAddressLabel,
}: UseComparePageInitializerProps): void => {
    const searchParams = useSearchParams();

    // Run initialization logic whenever URL search parameters change
    useEffect(() => {
        const slugFromUrl = searchParams.get("slug");
        const sortFromUrl = searchParams.get("sort") as SortOptionKey | null;
        const filtersFromUrl = deserializeFiltersFromURL(searchParams);

        /**
         * Applies URL-derived sort and filter parameters to the page state.
         */
        const applyUrlParams = (): void => {
            if (
                sortFromUrl &&
                SORT_OPTIONS.some((s) => s.key === sortFromUrl)
            ) {
                setSortOptionAction(sortFromUrl);
            }
            setFiltersAction({ ...DEFAULT_FILTERS, ...filtersFromUrl });
        };

        setIsLoadingFromSlugAction(!!slugFromUrl);
        setLoadingAction(true);

        if (slugFromUrl) {
            /**
             * Fetches shared comparison offers by slug, handles errors, and populates page state.
             */
            (async () => {
                try {
                    const res = await fetch(
                        `${API_BASE_URL}/compare/${slugFromUrl}`,
                        {
                            headers: { Accept: "application/json" },
                            cache: "no-store",
                        },
                    );

                    if (!res.ok) {
                        const { detail } = (await res
                            .json()
                            .catch(() => ({}))) as { detail?: string };
                        throw new Error(
                            detail ?? `Backend returned ${res.status}`,
                        );
                    }
                    const raw = await res.text();
                    console.log("▶️ RAW RESPONSE:", raw);
                    let data: SharedOffersResponse;
                    try {
                        data = JSON.parse(raw);
                    } catch {
                        throw new Error(`Invalid JSON from backend: ${raw.slice(0, 200)}`);
                    }

                    setOriginalOffersAction(data.offers);
                    setSlugAction(data.slug);

                    if (data.address) {
                        setParsedAddress?.(data.address);

                        setInitialAddressLabel?.(
                            `${data.address.street} ${data.address.house_number}, ` +
                                `${data.address.plz} ${data.address.city}`,
                        );
                    } else {
                        const shortSlug =
                            data.slug.length > 20
                                ? data.slug.slice(0, 17) + "…"
                                : data.slug;
                        setInitialAddressLabel?.(`Shared Search: ${shortSlug}`);
                        setParsedAddress?.(null);
                    }

                    applyUrlParams();
                } catch (err: unknown) {
                    const errorMessage =
                        err instanceof Error ? err.message : String(err);
                    console.error("Error loading shared offers:", err);
                    setStatusAction(
                        `Error: Could not load shared comparison. ${errorMessage}. Link may be invalid or expired.`,
                    );

                    setOriginalOffersAction([]);
                    setSlugAction(null);
                    setParsedAddress?.(null);
                    applyUrlParams();
                } finally {
                    setLoadingAction(false);
                    setIsLoadingFromSlugAction(false);
                }
            })();
        } else {
            setOriginalOffersAction([]);
            setSlugAction(null);
            setParsedAddress?.(null);
            applyUrlParams();
            setStatusAction("Enter an address to compare internet plans.");
            setLoadingAction(false);
            setIsLoadingFromSlugAction(false);
        }
    }, [searchParams]);
};
