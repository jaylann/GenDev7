'use client';

import React, {JSX, useEffect, useRef} from 'react';
import {useComparePageState} from '@/hooks/use-compare-page-state';

import {UpdatePromptDialog} from '@/components/compare/update-prompt-dialog';
import {PageHeader} from '@/components/compare/page-header';
import {RecentSearchesDropdown} from '@/components/compare/recent-searches-dropdown';
import {AddressSearchSection} from '@/components/compare/address-search-section';
import {OfferListControls,} from '@/components/compare/offer-list-controls';
import {OfferGrid} from '@/components/compare/offer-grid';
import {useToast} from "@/hooks/use-toast";

/**
 * Offer-comparison page – now a purely declarative layout that delegates **all**
 * business logic & side-effects to {@link useComparePageState}.
 */
export default function ComparePage(): JSX.Element {
    const {state, actions} = useComparePageState();
    const {toast} = useToast();
    const prevRefining = useRef(false);

    /* ───────── toast when refining kicks in ───────── */
    useEffect(() => {
        if (state.isRefiningOffers && !prevRefining.current) {
            toast(
                <div>
                    <p className="font-semibold text-white">Refining your search…</p>
                    <p className="text-slate-400">We&#39;re polishing the results while you browse.</p>
                </div>,
                { duration: 5_000 }
            );
        }
        prevRefining.current = state.isRefiningOffers;
    }, [state.isRefiningOffers, toast]);

    /* Hide any “Refining …” text that may come from the backend */
    const cleanedStatus =
        state.statusMessage.toLowerCase().startsWith('refining')
            ? ''
            : state.statusMessage;

    return (<div
        className="flex flex-col h-screen bg-gradient-to-br from-[#0B0B2D] via-[#1C1044] to-[#3C0E4C] text-slate-100 selection:bg-indigo-500 selection:text-white">
        <main
            className="container mx-auto max-w-7xl px-4 pt-12 pb-0 sm:pt-16 sm:pb-0
                      flex-1 flex flex-col space-y-10 sm:space-y-6
                      overflow-hidden"
        >
            {/* Offer-update prompt */}
            <UpdatePromptDialog
                isOpen={state.isUpdatePromptOpen}
                onOpenChange={actions.setIsUpdatePromptOpen}
                onConfirm={actions.handleShowPendingOffers}
                pendingOfferCount={state.pendingOffers?.length ?? 0}
            />

            {/* Status headline */}
            <PageHeader statusMessage={cleanedStatus}/>

            {/* Recent searches */}
            <RecentSearchesDropdown
                searches={state.recentSearches}
                onClear={actions.clearRecentSearches}
                className="fixed top-4 right-4 z-50"
            />

            {/* Address search box */}
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

            {/* Sort / filter bar */}
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
                isLoadingOffers={state.isWaitingInitialOffers || state.isRefiningOffers}
                areAnyOffersLoaded={state.areAnyOffersEverLoaded}
                isSingleOfferView={state.isSingleOfferView}
            />

            {/* Offer list / grid */}
            <div className="flex-1 overflow-y-auto">
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
            </div>
        </main>
    </div>);
}
