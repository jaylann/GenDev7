import React, { FC } from 'react';
import Image from 'next/image'; // Using Next/Image for optimized SVG loading
import { AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, Wifi as WifiIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Offer } from "@/types/offer";
import { ViewMode } from "@/components/compare/offer-list-controls";
import { SortOptionKey } from "@/types/sort-option-key";
import { OfferCard } from "@/components/compare/offer-card";

interface OfferGridProps {
    offers: Offer[];
    isLoading: boolean;
    viewMode: ViewMode;
    sortOption: SortOptionKey;
    /** True if `originalOffers` in ComparePage has data for the current search context, even if `offers` (processedOffers) is currently empty due to filters. */
    areOriginalOffersLoaded: boolean;
    statusMessage: string;
    onResetFilters: () => void;
    /** True if a search operation has been initiated (e.g., search button clicked, or loading from a URL slug). */
    hasSearchBeenPerformed: boolean;
}

/**
 * Displays the grid or list of internet offers.
 * It handles various states:
 * - Initial state before any search (shows a welcoming SVG and message).
 * - Loading state (shows skeletons).
 * - Empty state after a search yields no results for the address.
 * - Empty state when filters result in no visible offers.
 * - Display of offers in a grid or list view.
 */
export const OfferGrid: FC<OfferGridProps> = ({
                                                  offers,
                                                  isLoading,
                                                  viewMode,
                                                  sortOption,
                                                  areOriginalOffersLoaded,
                                                  statusMessage,
                                                  onResetFilters,
                                                  hasSearchBeenPerformed,
                                              }) => {
    // 1. Skeletons: Show if actively loading and no offers are yet available to display.
    const showSkeletons = isLoading && offers.length === 0;
    if (showSkeletons) {
        const skeletonCount = viewMode === 'grid' ? 6 : 3;
        return (
            <div
                className={cn(
                    "grid gap-6",
                    viewMode === 'grid' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3" : "grid-cols-1"
                )}
                data-testid="offer-grid-skeletons"
            >
                {Array.from({ length: skeletonCount }).map((_, i) => (
                    <Skeleton key={i} className="h-96 w-full rounded-xl bg-slate-700/50" />
                ))}
            </div>
        );
    }
    console.log(offers)

    // 2. Initial Placeholder: Show if no search has been performed yet and not loading.
    const showInitialPlaceholder = !isLoading && !hasSearchBeenPerformed && offers.length === 0;
    if (showInitialPlaceholder) {
        return (
            <div
                className="flex flex-col items-center justify-center text-center py-12 sm:py-16 text-slate-400"
                data-testid="offer-grid-initial-placeholder"
            >
                <Image
                    src="/compare.svg" // Ensure main.svg is in the /public folder
                    alt="Find internet offers"
                    width={300} // approx 12rem (w-48)
                    height={300} // approx 12rem (h-48)
                    className="mb-6 text-indigo-400" // text-indigo-400 might not affect external SVGs unless designed for it
                    priority // Load this SVG quickly as it's part of the initial view
                />
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-200 mb-2">
                    Ready to Find Your Perfect Plan?
                </h2>
                <p className="text-base sm:text-lg max-w-md">
                    Enter your address above to start comparing available internet offers in your area.
                </p>
            </div>
        );
    }

    // 3. No Results After Filtering: Show if a search was performed, offers were loaded, but current filters hide all of them.
    const showNoResultsAfterFilter = !isLoading && hasSearchBeenPerformed && areOriginalOffersLoaded && offers.length === 0;
    if (showNoResultsAfterFilter) {
        return (
            <div className="text-center py-10" data-testid="offer-grid-no-results-filter">
                <SlidersHorizontal className="mx-auto size-12 sm:size-16 text-slate-500 mb-4" />
                <p className="text-slate-300 text-lg sm:text-xl mb-1">No Offers Match Your Filters</p>
                <p className="text-slate-400 text-sm sm:text-base">
                    Try adjusting your filter criteria or{' '}
                    <Button
                        variant="link"
                        className="text-indigo-400 hover:text-indigo-300 px-1 py-0 h-auto inline"
                        onClick={onResetFilters}
                    >
                        reset all filters
                    </Button>
                    .
                </p>
            </div>
        );
    }

    // 4. No Offers Found for Address: Show if a search was performed, but the backend found no offers for that address.
    //    Avoid showing this during intermediate states like "connecting", "refining", or if an error is reported.
    const showNoOffersFoundForAddress =
        !isLoading &&
        hasSearchBeenPerformed &&
        !areOriginalOffersLoaded && // Crucial: means the backend search yielded nothing
        offers.length === 0 &&
        !statusMessage.toLowerCase().includes('error') &&
        !statusMessage.toLowerCase().includes('connecting') &&
        !statusMessage.toLowerCase().includes('refining') &&
        !statusMessage.toLowerCase().includes('initial offers');

    if (showNoOffersFoundForAddress) {
        return (
            <div className="text-center py-10" data-testid="offer-grid-no-offers-found">
                <WifiIcon className="mx-auto size-12 sm:size-16 text-slate-500 mb-4" />
                <p className="text-slate-300 text-lg sm:text-xl mb-1">No Offers Found</p>
                <p className="text-slate-400 text-sm sm:text-base">
                    We couldn't find any internet offers for the specified address.
                </p>
                <p className="text-slate-500 text-xs sm:text-sm">
                    Please double-check the address or try a different one.
                </p>
            </div>
        );
    }

    // 5. Fallback for Empty Offers: If offers array is empty and none of the above specific conditions met.
    //    This typically means an error or other status is being handled by PageHeader, so OfferGrid shows nothing.
    if (offers.length === 0) {
        return null;
    }

    // 6. Render Offers Grid/List
    return (
        // Max height is designed to allow scrolling within the grid area, preventing full page scroll for offer list
        // Adjust 450px/420px based on the actual height of elements above the grid (header, search, controls)
        <ScrollArea className={cn("overflow-y-auto", "max-h-[calc(100vh-450px)] sm:max-h-[calc(100vh-420px)]")}>
            <AnimatePresence mode="popLayout">
                <div
                    className={cn(
                        "grid gap-5 sm:gap-6 p-1", // Added p-1 for minor spacing around cards if scrollbar appears
                        viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1 md:grid-cols-2 gap-4"
                    )}
                    data-testid="offer-grid-results"
                >
                    {offers.map((offer) => (
                        <OfferCard
                            key={`${offer.provider}-${offer.product_id}`} // Ensuring unique key
                            offer={offer}
                            currentSortOption={sortOption}
                        />
                    ))}
                </div>
            </AnimatePresence>
        </ScrollArea>
    );
};