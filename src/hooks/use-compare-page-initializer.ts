"use client";
/**
 * Initializes the compare page state by interpreting URL parameters and retrieving shared offers.
 * Extracts the slug, sorting preferences, and filter settings; fetches comparison data when a slug is provided.
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
 * Properties required by the useComparePageInitializer hook.
 *
 * @property setOriginalOffersAction - Callback to set the comparison offers list.
 * @property setSlugAction - Callback to record the comparison slug.
 * @property setSortOptionAction - Callback to apply the chosen sort option.
 * @property setFiltersAction - Callback to apply the active filter state.
 * @property setStatusAction - Callback to update UI status messages.
 * @property setLoadingAction - Callback to toggle the global loading indicator.
 * @property setIsLoadingFromSlugAction - Callback to indicate loading status when using a slug.
 * @property setParsedAddress - Optional callback to supply validated address data.
 * @property setInitialAddressLabel - Optional callback to provide a fallback address label.
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
 * Establishes the initial state of the compare page based on URL search parameters.
 *
 * @param props - Collection of callbacks for managing page state and user feedback.
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

    // Listen for changes in URL parameters to initialize or update page state.
    useEffect(() => {
        // Create an AbortController to cancel fetch requests when component unmounts or URL changes
        const abortController = new AbortController();
        const signal = abortController.signal;
        
        const slugFromUrl = searchParams.get("slug");
        const sortFromUrl = searchParams.get("sort") as SortOptionKey | null;
        const filtersFromUrl = deserializeFiltersFromURL(searchParams);

        /**
         * Applies sorting and filtering parameters derived from the URL to the page state.
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
             * Retrieves comparison data using the provided slug and updates the page state.
             */
            (async () => {
                try {
                    const res = await fetch(
                        `${API_BASE_URL}/compare/${slugFromUrl}`,
                        {
                            headers: { Accept: "application/json" },
                            cache: "no-store",
                            signal, // Add abort signal to allow cancellation
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
                    // Only log detailed errors in development
                    if (process.env.NODE_ENV !== 'production') {
                        console.error("Error loading shared offers:", err);
                    }
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
        // Initialize default state when no slug is present.
        } else {
            setOriginalOffersAction([]);
            setSlugAction(null);
            setParsedAddress?.(null);
            applyUrlParams();
            setStatusAction("Enter an address to compare internet plans.");
            setLoadingAction(false);
            setIsLoadingFromSlugAction(false);
        }
        
        // Cleanup function to abort any in-flight requests when the component unmounts or deps change
        return () => {
            abortController.abort();
        };
    }, [searchParams]);
};
