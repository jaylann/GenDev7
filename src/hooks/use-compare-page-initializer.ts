"use client";
/**
 * useComparePageInitializer Module
 *
 * Contains a custom React hook for initializing the compare page state
 * by reading URL parameters (slug, sort, filters) and fetching shared offers when needed.
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

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

export interface UseComparePageInitializerProps {
    setOriginalOffersAction: (offers: Offer[]) => void;
    setSlugAction: (slug: string | null) => void;
    setSortOptionAction: (sort: SortOptionKey) => void;
    setFiltersAction: (filters: FiltersState) => void;
    setStatusAction: (message: string) => void;
    setLoadingAction: (loading: boolean) => void;
    setIsLoadingFromSlugAction: (loading: boolean) => void;
    setParsedAddress?: (addr: Address | null) => void;
    setInitialAddressLabel?: (label: string) => void;
    searchIsActiveRef: React.RefObject<boolean>;
}

export const useComparePageInitializer = ({
    setOriginalOffersAction,
    setSlugAction,
    setSortOptionAction,
    setFiltersAction,
    setStatusAction,
    setLoadingAction,
    setIsLoadingFromSlugAction,
    setParsedAddress,
    setInitialAddressLabel,
    searchIsActiveRef,
}: UseComparePageInitializerProps): void => {
    const searchParams = useSearchParams();
    const initialNonSlugLoadProcessedRef = useRef(false);

    useEffect(() => {
        const slugFromUrl = searchParams.get("slug");
        const sortFromUrl = searchParams.get("sort") as SortOptionKey | null;
        const filtersFromUrl = deserializeFiltersFromURL(searchParams);

        const applyUrlParams = (): void => {
            if (
                sortFromUrl &&
                SORT_OPTIONS.some((s) => s.key === sortFromUrl)
            ) {
                setSortOptionAction(sortFromUrl);
            }
            // Ensure filters from URL are merged with defaults,
            // and then existing filters are updated, not completely overwritten
            // if no filter params are in the URL.
            const currentFilters = { ...DEFAULT_FILTERS, ...filtersFromUrl };
            setFiltersAction(currentFilters);
        };

        // If an active search is in progress (e.g., user just clicked "Search"),
        // this hook should be very careful not to interfere with its loading states or status.
        // However, if the URL changed (e.g. recent search navigation), we *do* need to process it.
        const isUserInitiatedSearchActive = searchIsActiveRef.current;

        if (slugFromUrl) {
            initialNonSlugLoadProcessedRef.current = true; // Mark that a slug has been encountered
            // Only set loading states if a user search is NOT active.
            // If navigating to a slug URL (e.g. recent search), these should be set.
            if (!isUserInitiatedSearchActive) {
                setIsLoadingFromSlugAction(true);
                setLoadingAction(true);
            }

            (async () => {
                try {
                    // ... (fetch logic for slug remains the same)
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
                    let data: SharedOffersResponse;
                    try {
                        data = await res.json();
                    } catch (parseError) {
                        const errorDetails = parseError instanceof Error ? parseError.message : String(parseError);
                        console.error("Error parsing shared offers JSON:", errorDetails);
                        throw new Error(`Invalid data structure received from server. ${errorDetails}`);
                    }

                    setOriginalOffersAction(data.offers);
                    setSlugAction(data.slug); // This will also update currentDisplaySlug in parent

                    const offerCount = data.offers?.length || 0;
                    // Only set status if a user search is NOT overriding it
                    if (!isUserInitiatedSearchActive) {
                        if (offerCount > 0) {
                            setStatusAction(`Displaying shared results (${offerCount} ${offerCount === 1 ? "offer" : "offers"} found).`);
                        } else {
                            setStatusAction("Shared link loaded, but no offers found for this search.");
                        }
                    }


                    if (data.address) {
                        setParsedAddress?.(data.address);
                        setInitialAddressLabel?.(
                            `${data.address.street} ${data.address.house_number}, ` +
                                `${data.address.plz} ${data.address.city}`,
                        );
                    } else {
                         if (offerCount === 0 && !data.address && !isUserInitiatedSearchActive) {
                            setStatusAction(`Loaded shared link. No offers or address details found.`);
                        }
                        // Use a generic label if no address is present in shared data.
                        const shortSlug = data.slug.length > 20 ? data.slug.slice(0, 17) + "…" : data.slug;
                        setInitialAddressLabel?.(offerCount > 0 ? `Shared Results: ${shortSlug}` : `Shared Link: ${shortSlug}`);
                        setParsedAddress?.(null);
                    }

                    applyUrlParams(); // Apply sort/filters from the slug URL
                } catch (err: unknown) {
                    // ... (error handling remains the same)
                    const errorMessage =
                        err instanceof Error ? err.message : String(err);
                    console.error("Error loading shared offers:", err);
                    // Error status should always be shown
                    setStatusAction(
                        `Error: Could not load shared comparison. ${errorMessage}. Link may be invalid or expired.`,
                    );
                    setOriginalOffersAction([]);
                    setSlugAction(null);
                    setParsedAddress?.(null);
                    applyUrlParams();
                } finally {
                    if (!isUserInitiatedSearchActive) {
                        setLoadingAction(false);
                        setIsLoadingFromSlugAction(false);
                    }
                }
            })();
        } else { // No slug in URL
            applyUrlParams(); // Always apply sort/filter params if present, even on a base /compare URL

            // Only reset offers and set "Enter an address..." if:
            // 1. It's not an active user-initiated search.
            // 2. This "no-slug" scenario hasn't been processed for the initial page load yet.
            //    This prevents clearing offers if a user performs a search, then modifies filters
            //    (which might change URL but keep it at /compare without a slug).
            if (!isUserInitiatedSearchActive && !initialNonSlugLoadProcessedRef.current) {
                setOriginalOffersAction([]);
                setSlugAction(null); // This clears currentDisplaySlug
                setParsedAddress?.(null);
                setStatusAction("Enter an address to compare internet plans.");
                initialNonSlugLoadProcessedRef.current = true;
            }

            // Ensure loading flags are false if we reach here without a slug
            // and no active search is making them true.
            if (!isUserInitiatedSearchActive) {
                 setLoadingAction(false);
                 setIsLoadingFromSlugAction(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]); // `searchIsActiveRef` is a ref, so it doesn't need to be in the dep array.
                        // Setters from props are stable.
};
