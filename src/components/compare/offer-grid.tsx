import React, { FC } from "react";
import Image from "next/image";
import { AnimatePresence } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, Wifi as WifiIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Offer } from "@/types/offer";
import { ViewMode } from "@/components/compare/offer-list-controls";
import { OfferCard } from "@/components/compare/offer-card";

interface OfferGridProps {
    offers: Offer[];
    isLoading: boolean;
    viewMode: ViewMode;
    areOriginalOffersLoaded: boolean;
    statusMessage: string;
    onResetFilters: () => void;
    hasSearchBeenPerformed: boolean;
    /** Callback to handle sharing a single offer. */
    onShareOffer: (offer: Offer) => void;
    /** The slug for the current full list of offers, required for sharing. */
    activeShareableSlug: string | null;
}

export const OfferGrid: FC<OfferGridProps> = ({
    offers,
    isLoading,
    viewMode,
    areOriginalOffersLoaded,
    statusMessage,
    onResetFilters,
    hasSearchBeenPerformed,
    onShareOffer,
    activeShareableSlug,
}) => {
    // 1. Skeletons
    const showSkeletons = isLoading && offers.length === 0;
    if (showSkeletons) {
        const skeletonCount = viewMode === "grid" ? 6 : 3;
        return (
            <div
                className={cn(
                    "grid gap-6",
                    viewMode === "grid"
                        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"
                        : "grid-cols-1",
                )}
                data-testid="offer-grid-skeletons"
            >
                {Array.from({ length: skeletonCount }).map((_, i) => (
                    <Skeleton
                        key={i}
                        className="h-96 w-full rounded-xl bg-slate-700/50"
                    />
                ))}
            </div>
        );
    }

    // 2. Initial Placeholder
    const showInitialPlaceholder =
        !isLoading && !hasSearchBeenPerformed && offers.length === 0;
    if (showInitialPlaceholder) {
        return (
            <div
                className="flex flex-col items-center justify-center text-center py-12 sm:py-16 text-slate-400"
                data-testid="offer-grid-initial-placeholder"
            >
                <Image
                    src="/compare.svg"
                    alt="Find internet offers"
                    width={300}
                    height={300}
                    className="mb-6 text-indigo-400"
                    priority
                />
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-200 mb-2">
                    Ready to Find Your Perfect Plan?
                </h2>
                <p className="text-base sm:text-lg max-w-md">
                    Enter your address above to start comparing available
                    internet offers in your area.
                </p>
            </div>
        );
    }

    // 3. No Results After Filtering
    const showNoResultsAfterFilter =
        !isLoading &&
        hasSearchBeenPerformed &&
        areOriginalOffersLoaded &&
        offers.length === 0;
    if (showNoResultsAfterFilter) {
        return (
            <div
                className="text-center py-10"
                data-testid="offer-grid-no-results-filter"
            >
                <SlidersHorizontal className="mx-auto size-12 sm:size-16 text-slate-500 mb-4" />
                <p className="text-slate-300 text-lg sm:text-xl mb-1">
                    No Offers Match Your Filters
                </p>
                <p className="text-slate-400 text-sm sm:text-base">
                    Try adjusting your filter criteria or{" "}
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

    // 4. No Offers Found for Address
    const showNoOffersFoundForAddress =
        !isLoading &&
        hasSearchBeenPerformed &&
        !areOriginalOffersLoaded &&
        offers.length === 0 &&
        !statusMessage.toLowerCase().includes("error") &&
        !statusMessage.toLowerCase().includes("connecting") &&
        !statusMessage.toLowerCase().includes("refining") &&
        !statusMessage.toLowerCase().includes("initial offers");

    if (showNoOffersFoundForAddress) {
        return (
            <div
                className="text-center py-10"
                data-testid="offer-grid-no-offers-found"
            >
                <WifiIcon className="mx-auto size-12 sm:size-16 text-slate-500 mb-4" />
                <p className="text-slate-300 text-lg sm:text-xl mb-1">
                    No Offers Found
                </p>
                <p className="text-slate-400 text-sm sm:text-base">
                    We couldn&#39;t find any internet offers for the specified
                    address.
                </p>
                <p className="text-slate-500 text-xs sm:text-sm">
                    Please double-check the address or try a different one.
                </p>
            </div>
        );
    }

    // 5. Fallback for Empty Offers
    if (offers.length === 0 && hasSearchBeenPerformed) {
        // only return null if search was done. Otherwise initial placeholder takes precedence
        return null;
    }

    // 6. Render Offers Grid/List
    return (
        <div className="h-full overflow-y-auto scrollbar-none">
            <AnimatePresence mode="popLayout">
                <div
                    className={cn(
                        "grid gap-5 sm:gap-6 px-1",
                        viewMode === "grid"
                            ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                            : "grid-cols-1 md:grid-cols-2 gap-4",
                    )}
                    data-testid="offer-grid-results"
                >
                    {offers.map((offer) => (
                        <OfferCard
                            key={`${offer.provider}-${offer.product_id}`}
                            offer={offer}
                            onShareOffer={onShareOffer}
                            activeShareableSlug={activeShareableSlug}
                        />
                    ))}
                </div>
            </AnimatePresence>
        </div>
    );
};
