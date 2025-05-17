'use client';

import React, {JSX} from 'react';
import {useComparePageState} from '@/hooks/use-compare-page-state';

import {UpdatePromptDialog} from '@/components/compare/update-prompt-dialog';
import {PageHeader} from '@/components/compare/page-header';
import {RecentSearchesDropdown} from '@/components/compare/recent-searches-dropdown';
import {AddressSearchSection} from '@/components/compare/address-search-section';
import {OfferListControls, ViewMode,} from '@/components/compare/offer-list-controls';
import {OfferGrid} from '@/components/compare/offer-grid';

/**
 * Offer-comparison page – now a purely declarative layout that delegates **all**
 * business logic & side-effects to {@link useComparePageState}.
 */
export default function ComparePage(): JSX.Element {
    const {state, actions} = useComparePageState();

    return (<div
            className="min-h-screen bg-gradient-to-br from-[#0B0B2D] via-[#1C1044] to-[#3C0E4C] text-slate-100 selection:bg-indigo-500 selection:text-white">
            <main className="container mx-auto max-w-7xl px-4 py-12 sm:py-16 space-y-10 sm:space-y-12">
                {/* Offer-update prompt */}
                <UpdatePromptDialog
                    isOpen={state.isUpdatePromptOpen}
                    onOpenChange={actions.setIsUpdatePromptOpen}
                    onConfirm={actions.handleShowPendingOffers}
                    pendingOfferCount={state.pendingOffers?.length ?? 0}
                />

                {/* Status headline */}
                <PageHeader statusMessage={state.isRefiningOffers ? 'Refining search…' : state.statusMessage}/>

                {/* Recent searches */}
                <RecentSearchesDropdown
                    searches={state.recentSearches}
                    onClear={actions.clearRecentSearches}
                    className="fixed top-4 right-4 z-50"
                />

                {/* Address search box */}
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

                {/* Sort / filter bar */}
                <OfferListControls
                    sortOption={state.sortOption}
                    onSortChange={actions.setSortOption}
                    viewMode={state.viewMode as ViewMode}
                    onViewModeChange={actions.setViewMode}
                    onShare={actions.handleSharePage}
                    isShareDisabled={state.isSharePageDisabled}
                    sharedLinkCopied={state.sharedLinkCopied}
                    filters={state.filters}
                    onFiltersChange={actions.setFilters}
                    activeFilterCount={state.activeFilterCount}
                    originalOffers={state.originalOffers}
                    isLoadingOffers={state.isWaitingInitialOffers || state.isRefiningOffers}
                    areAnyOffersLoaded={state.areAnyOffersEverLoaded}
                    isSingleOfferView={state.isSingleOfferView}
                />

                {/* Offer list / grid */}
                <OfferGrid
                    offers={state.processedOffers}
                    isLoading={state.isBlockingUi || state.isRefiningOffers}
                    viewMode={state.viewMode}
                    areOriginalOffersLoaded={state.originalOffers.length > 0}
                    statusMessage={state.statusMessage}
                    onResetFilters={actions.resetFilters}
                    hasSearchBeenPerformed={state.hasSearchBeenPerformed}
                    onShareOffer={actions.handleShareSingleOffer}
                    activeShareableSlug={state.activeShareableSlug}
                />
            </main>
        </div>);
}
