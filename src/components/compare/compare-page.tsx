"use client";

import React, { JSX } from "react";
import { useComparePageState } from "@/hooks/use-compare-page-state";

import { UpdatePromptDialog } from "@/components/compare/update-prompt-dialog";
import { PageHeader } from "@/components/compare/page-header";
import { RecentSearchesDropdown } from "@/components/compare/recent-searches-dropdown";
import { AddressSearchSection } from "@/components/compare/address-search-section";
import { OfferListControls } from "@/components/compare/offer-list-controls";
import { OfferGrid } from "@/components/compare/offer-grid";

/**
 * ComparePage component renders the main offer comparison UI.
 *
 * Utilizes the useComparePageState hook for state management and actions.
 * Renders:
 *  - UpdatePromptDialog for pending offers
 *  - PageHeader with a status message
 *  - RecentSearchesDropdown for quick access to past searches
 *  - AddressSearchSection for address input and lookup
 *  - OfferListControls for sorting, filtering, and sharing
 *  - OfferGrid for displaying the list or grid of offers
 *
 * On mobile devices, the entire content area including the header and search sections
 * will scroll. On desktop devices (md breakpoint and larger), the header and search
 * sections remain fixed at the top, and only the offer grid becomes scrollable.
 * The top sections (PageHeader, AddressSearchSection, OfferListControls) are set
 * to not shrink, ensuring they maintain their natural height.
 *
 * @returns {JSX.Element} The rendered ComparePage component.
 */
export default function ComparePage(): JSX.Element {
    const { state, actions } = useComparePageState();

    const cleanedStatus = state.statusMessage
        .toLowerCase()
        .startsWith("refining")
        ? ""
        : state.statusMessage;

    return (
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
                {/* Wrap PageHeader with flex-none to prevent shrinking */}
                <div className="flex-none">
                    <PageHeader
                        mainStatusMessage={state.mainStatusMessage} // Or state.statusMessage if you kept that name
                        offerCount={state.currentOfferCount}
                        isLoading={state.isGloballyLoading}
                        isRefining={state.isSpecificallyRefining} // or state.isRefiningOffers
                    />
                </div>

                {/* Dropdown for accessing and clearing recent address searches */}
                <RecentSearchesDropdown
                    searches={state.recentSearches}
                    onClear={actions.clearRecentSearches}
                    className="fixed top-4 right-4 z-50"
                    currentSlug={state.currentDisplaySlug}
                />

                {/* Address search section for inputting and selecting an address */}
                {/* Already wrapped with flex-none, which is good */}
                <div className="flex-none">
                    <AddressSearchSection
                        parsedAddress={state.parsedAddressFromSlug ?? undefined}
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
                {/* Wrap OfferListControls with flex-none to prevent shrinking */}
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
                {/* This div will take up the remaining space and scroll its content on desktop */}
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
    );
}