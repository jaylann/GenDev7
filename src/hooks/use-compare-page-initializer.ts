// app/compare/hooks/useComparePageInitializer.ts
import { Offer } from "@/types/offer";
import { SortOptionKey } from "@/types/sort-option-key";
import { FiltersState } from "@/types/filters-state";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { deserializeFiltersFromURL } from "@/utils/url";
import { API_BASE_URL, DEFAULT_FILTERS, SORT_OPTIONS } from "@/config/constants";

interface UseComparePageInitializerProps {
    setOriginalOffers: (offers: Offer[]) => void;
    setSlug: (slug: string | null) => void;
    setSortOption: (sort: SortOptionKey) => void;
    setFilters: (filters: FiltersState) => void;
    setStatus: (message: string) => void;
    setLoading: (loading: boolean) => void;
    setIsLoadingFromSlug: (loading: boolean) => void;
    /** Optional: Callback to set an address label derived from slug data, if available. */
    setInitialAddressLabel?: (label: string) => void;
}

/**
 * Custom hook to initialize page state from URL parameters (slug, sort, filters).
 * Fetches shared offers if a slug is present. Re-runs if searchParams change.
 * @param props - Callbacks to update parent component state.
 */
export const useComparePageInitializer = ({
                                              setOriginalOffers,
                                              setSlug,
                                              setSortOption,
                                              setFilters,
                                              setStatus,
                                              setLoading,
                                              setIsLoadingFromSlug,
                                              setInitialAddressLabel,
                                          }: UseComparePageInitializerProps): void => {
    const searchParams = useSearchParams();

    useEffect(() => {
        const slugFromUrl = searchParams.get('slug');
        const sortFromUrl = searchParams.get('sort') as SortOptionKey | null;
        const filtersFromUrl = deserializeFiltersFromURL(searchParams);

        const applyUrlParams = (): void => {
            if (sortFromUrl && SORT_OPTIONS.some(s => s.key === sortFromUrl)) {
                setSortOption(sortFromUrl);
            } else {
                // If no sort option in URL or invalid, reset to default or retain existing
                // For simplicity, let's ensure it's set, perhaps to default if not specified.
                // setSortOption('recommended'); // Or handle as per your app's logic
            }
            // Apply filters from URL, merging with defaults
            const newFilters = { ...DEFAULT_FILTERS, ...filtersFromUrl };
            setFilters(newFilters);
        };

        setIsLoadingFromSlug(true); // Indicate that we are now processing based on URL params (potentially a slug)
        setLoading(true); // General loading state

        if (slugFromUrl) {
            setStatus(`Loading shared comparison (slug: ${slugFromUrl.substring(0,20)}...)...`);

            const fetchSharedOffers = async (): Promise<void> => {
                try {
                    const response = await fetch(`/api/get-shared-offers?slug=${slugFromUrl}`);
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" }));
                        throw new Error(errorData.error || `Failed to fetch shared offers: ${response.statusText}`);
                    }

                    // Assuming backend might return address info with the slug
                    const data: { offers: Offer[]; slug: string; addressLabel?: string } = await response.json();

                    setOriginalOffers(data.offers);
                    setSlug(data.slug); // Set slug from fetched data
                    if (data.addressLabel && setInitialAddressLabel) {
                        setInitialAddressLabel(data.addressLabel);
                    } else if (setInitialAddressLabel) {
                        // Fallback label if address not in slug data
                        const slugDisplay = data.slug.length > 20 ? data.slug.substring(0, 17) + "..." : data.slug;
                        setInitialAddressLabel(`Shared Search: ${slugDisplay}`);
                    }
                    setStatus(`Loaded ${data.offers.length} shared offers.`);
                    applyUrlParams(); // Apply sort/filters AFTER offers are loaded
                } catch (error: any) {
                    console.error("Error loading shared offers:", error);
                    setStatus(`Error: Could not load shared comparison. ${error.message}. Link may be invalid or expired.`);
                    setOriginalOffers([]);
                    setSlug(null);
                    // Still apply other URL params like filters if they exist, even if slug fails
                    applyUrlParams();
                } finally {
                    setLoading(false);
                    setIsLoadingFromSlug(false);
                }
            };
            fetchSharedOffers();
        } else {
            // No slug, just apply other params and clear any existing offers/slug
            setOriginalOffers([]);
            setSlug(null);
            applyUrlParams();
            setStatus('Enter an address to compare internet plans.');
            setLoading(false);
            setIsLoadingFromSlug(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]); // Key change: Hook now re-runs when searchParams change.
    // ESLint might ask for other dependencies (setters). They are stable from useState,
    // but you can add them if your ESLint config requires it:
    // }, [searchParams, setOriginalOffers, setSlug, setSortOption, setFilters, setStatus, setLoading, setIsLoadingFromSlug, setInitialAddressLabel]);
};