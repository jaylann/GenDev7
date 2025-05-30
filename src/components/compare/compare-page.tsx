"use client";

import React, { JSX } from "react";
import { useComparePageState } from "@/hooks/use-compare-page-state";

import { ErrorBoundary } from "@/components/ui/error-boundary";
import { UpdatePromptDialog } from "@/components/compare/update-prompt-dialog";
import { PageHeader } from "@/components/compare/page-header";
import { RecentSearchesDropdown } from "@/components/compare/recent-searches-dropdown";
import { AddressSearchSection } from "@/components/compare/address-search-section";
import { OfferListControls } from "@/components/compare/offer-list-controls";
import { OfferGrid } from "@/components/compare/offer-grid";

/**
 * ComparePage
 *
 * Renders the main offer comparison interface, integrating components for update prompts,
 * address search, recent searches, sorting, filtering, and offer display.
 *
 * @remarks
 * - On mobile devices, the entire content (header and search sections) scrolls.
 * - On desktop (md breakpoint and above), header and search sections remain fixed,
 *   while the offer grid is scrollable.
 *
 * @returns {JSX.Element} The ComparePage component.
 *
 * @component
 */
export default function ComparePage(): JSX.Element {
    const { state, actions } = useComparePageState();

    return (
        <ErrorBoundary>
        <div className="flex flex-col h-screen bg-gradient-to-br from-[#0B0B2D] via-[#1C1044] to-[#3C0E4C] text-slate-100 selection:bg-indigo-500 selection:text-white">
            <main
                className="container mx-auto max-w-7xl px-4 pt-12 pb-0 sm:pt-16 sm:pb-0
                      flex-1 flex flex-col space-y-2 sm:space-y-6
                      overflow-y-auto md:overflow-y-hidden"
            >
                {/* Offer-update prompt dialog, triggers when there are pending offers to confirm */}
                <UpdatePromptDialog
                    isOpen={state.isUpdatePromptOpen}
                    onOpenChange={actions.setIsUpdatePromptOpen}
                    onConfirm={actions.handleShowPendingOffers}
                    pendingOfferCount={state.pendingOffers?.length ?? 0}
                />

                {/* Page header displaying the cleaned status message */}
                <div className="flex-none">
                    <PageHeader
                        mainStatusMessage={state.mainStatusMessage}
                        offerCount={state.currentOfferCount}
                        isLoading={state.isGloballyLoading}
                        isRefining={state.isSpecificallyRefining}
                    />
                </div>

                {/* Dropdown for accessing and clearing recent address searches */}
                <RecentSearchesDropdown
                    searches={state.recentSearches}
                    onClear={actions.clearRecentSearches}
                    className="fixed top-4 right-4 z-50"
                />

                {/* Address search section for inputting and selecting an address */}
                <div className="flex-none">
                    <AddressSearchSection
                        parsedAddress={
                            state.parsedAddressFromSlug      // 🌟 slug address first
                            ?? state.parsedAddressCurrent  // fallback: last manual address
                            ?? undefined
                        }
                        defaultAddressText={state.initialAddressLabel}
                        onAddressSelect={actions.handleAddressSelected}
                        onSearchClick={actions.handleSearchClick}
                        isSearchDisabled={state.isSearchButtonDisabled}
                        isLoading={state.isBlockingUi}
                        isLoadingFromSlug={state.isLoadingFromUrl}
                        currentSlug={state.currentDisplaySlug}
                    />
                </div>

                {/* Controls for sorting, filtering, and sharing the offer list */}
                <div className="flex-none">
                    <OfferListControls
                        sortOption={state.sortOption}
                        onSortChange={actions.setSortOption}
                        viewMode={state.viewMode}
                        onViewModeChange={actions.setViewMode}
                        onShare={actions.handleSharePage}
                        isShareDisabled={state.isSharePageDisabled}
                        sharedLinkCopied={state.sharedLinkCopied}
                        filters={state.filters}
                        onFiltersChange={actions.setFilters}
                        activeFilterCount={state.activeFilterCount}
                        originalOffers={state.originalOffers}
                        isLoadingOffers={
                            state.isWaitingInitialOffers || state.isRefiningOffers
                        }
                        areAnyOffersLoaded={state.areAnyOffersEverLoaded}
                        isSingleOfferView={state.isSingleOfferView}
                    />
                </div>

                {/* Main content area: displays offers in grid or list view */}
                <div className="flex-1 md:overflow-y-auto">
                    <OfferGrid
                        offers={state.processedOffers}
                        isLoading={state.isBlockingUi || state.isRefiningOffers}
                        viewMode={state.viewMode}
                        areOriginalOffersLoaded={
                            state.originalOffers.length > 0
                        }
                        statusMessage={state.statusMessage}
                        onResetFilters={actions.resetFilters}
                        hasSearchBeenPerformed={state.hasSearchBeenPerformed}
                        onShareOffer={actions.handleShareSingleOffer}
                        activeShareableSlug={state.activeShareableSlug}
                    />
                </div>
            </main>
        </div>
        </ErrorBoundary>
    );
}