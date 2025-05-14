// app/compare/components/OfferGrid.tsx
import React, { FC } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, Wifi as WifiIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {Offer} from "@/types/offer";
import {ViewMode} from "@/components/compare/offer-list-controls";
import {SortOptionKey} from "@/types/sort-option-key";
import {OfferCard} from "@/components/compare/offer-card";

interface OfferGridProps {
    offers: Offer[];
    isLoading: boolean;
    viewMode: ViewMode;
    sortOption: SortOptionKey;
    areOriginalOffersLoaded: boolean; // True if any offers have been fetched, even if currently filtered to zero
    statusMessage: string; // To provide context for empty states
    onResetFilters: () => void; // Callback to reset filters
}

/**
 * Displays the grid or list of internet offers, including loading skeletons and empty states.
 */
export const OfferGrid: FC<OfferGridProps> = ({
                                                  offers,
                                                  isLoading,
                                                  viewMode,
                                                  sortOption,
                                                  areOriginalOffersLoaded,
                                                  statusMessage,
                                                  onResetFilters,
                                              }) => {
    const showSkeletons = isLoading && offers.length === 0;
    const showNoResultsAfterFilter = !isLoading && areOriginalOffersLoaded && offers.length === 0;
    const showNoOffersFound = !isLoading && !areOriginalOffersLoaded && offers.length === 0 &&
        !statusMessage.toLowerCase().includes('error') &&
        !statusMessage.toLowerCase().includes('connecting') &&
        !statusMessage.toLowerCase().includes('refining') &&
        !statusMessage.toLowerCase().includes('initial offers') &&
        !statusMessage.toLowerCase().includes('enter an address'); // Don't show if initial state


    if (showSkeletons) {
        const skeletonCount = viewMode === 'grid' ? 6 : 3;
        return (
            <div
                className={cn(
                    "grid gap-6",
                    viewMode === 'grid' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3" : "grid-cols-1"
                )}
            >
                {Array.from({ length: skeletonCount }).map((_, i) => (
                    <Skeleton key={i} className="h-96 w-full rounded-xl bg-slate-700/50" />
                ))}
            </div>
        );
    }

    if (showNoResultsAfterFilter) {
        return (
            <div className="text-center py-10">
                <SlidersHorizontal className="mx-auto size-16 text-slate-500 mb-4" />
                <p className="text-slate-400 text-lg">No offers match your current filters.</p>
                <p className="text-slate-500 text-sm">
                    Try adjusting your filter criteria or
                    <Button
                        variant="link"
                        className="text-indigo-400 px-1 py-0 h-auto inline"
                        onClick={onResetFilters}
                    >
                        reset all filters
                    </Button>.
                </p>
            </div>
        );
    }

    if (showNoOffersFound) {
        return (
            <div className="text-center py-10">
                <WifiIcon className="mx-auto size-16 text-slate-500 mb-4" />
                <p className="text-slate-400 text-lg">No offers found for this address.</p>
                <p className="text-slate-500 text-sm">Please ensure the address is correct and try again.</p>
            </div>
        );
    }

    if (offers.length === 0) {
        // This case covers scenarios where there are no offers and none of the above specific empty states apply.
        // For example, before any search is made, or if an error occurred (statusMessage would indicate this).
        // If statusMessage is actively showing an error or loading, PageHeader already handles it.
        // So, this might not be strictly needed if PageHeader + other empty states are comprehensive.
        return null; // Or a generic placeholder if desired.
    }


    return (
        <ScrollArea className={cn("overflow-y-auto", "max-h-[calc(100vh-450px)] sm:max-h-[calc(100vh-420px)]")}>
            <AnimatePresence mode="popLayout">
                <div
                    className={cn(
                        "grid gap-5 sm:gap-6 p-1",
                        viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1 md:grid-cols-2 gap-4"
                    )}
                >
                    {offers.map((o) => (
                        <OfferCard
                            key={`${o.provider}-${o.product_id}`}
                            offer={o}
                            currentSortOption={sortOption}
                        />
                    ))}
                </div>
            </AnimatePresence>
        </ScrollArea>
    );
};
