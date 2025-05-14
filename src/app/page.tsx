'use client';

import React, {
    useState,
    useCallback,
    useEffect,
    useRef,
    JSX,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOfferProcessing } from '@/hooks/use-offer-processing';
import { Offer } from '@/types/offer';
import { ParsedAddress } from '@/components/address-autocomplete-input';
import type { Address } from '@/types/address';
import {
    OfferListControls,
    ViewMode,
} from '@/components/compare/offer-list-controls';
import { SortOptionKey } from '@/types/sort-option-key';
import { useOfferFilters } from '@/hooks/use-offer-filters';
import {
    DEFAULT_FILTERS,
    GOOGLE_MAPS_API_KEY_FROM_ENV,
} from '@/config/constants';
import { useRecentSearches } from '@/hooks/use-recent-searches';
import { useComparePageInitializer } from '@/hooks/use-compare-page-initializer';
import { useOfferWebSocket, SlugType } from '@/hooks/use-offer-websocket';
import { UpdatePromptDialog } from '@/components/compare/update-prompt-dialog';
import { PageHeader } from '@/components/compare/page-header';
import { RecentSearchesDropdown } from '@/components/compare/recent-searches-dropdown';
import { AddressSearchSection } from '@/components/compare/address-search-section';
import { OfferGrid } from '@/components/compare/offer-grid';
import { serializeFiltersForURL } from '@/utils/url';

// -----------------------------------------------------------------------------
// Helper – build URL with slug + sort + filters
// -----------------------------------------------------------------------------
const buildUrl = (
    slug: string | null,
    sort: SortOptionKey,
    filters: ReturnType<typeof useOfferFilters>['filters'],
): string | null => {
    if (!slug) return null;
    const qp = new URLSearchParams();
    qp.set('slug', slug);
    if (sort !== 'recommended') qp.set('sort', sort);
    const fq = serializeFiltersForURL(filters);
    if (fq) {
        const fp = new URLSearchParams(fq);
        fp.forEach((v, k) => qp.set(k, v));
    }
    const base =
        typeof window !== 'undefined' &&
        window.location.pathname.startsWith('/compare')
            ? '/compare/'
            : '/';
    return `${base.replace(/\/$/, '')}?${qp.toString()}`;
};

// =============================================================================
// Component
// =============================================================================
export default function ComparePage(): JSX.Element {
    const router = useRouter();
    const currentSearchParams = useSearchParams();

    // ---------------------------------------------------------------------------
    // Core state
    // ---------------------------------------------------------------------------
    const [originalOffers, setOriginalOffers] = useState<Offer[]>([]);
    const [pendingOffers, setPendingOffers] = useState<Offer[] | null>(null);

    const [parsedBackendAddress, setParsedBackendAddress] =
        useState<ParsedAddress | null>(null);
    const [searchInitiatedWithAddress, setSearchInitiatedWithAddress] =
        useState<string | null>(null);
    const [parsedAddressFromSlug, setParsedAddressFromSlug] = useState<Address | null>(null);
    const [initialAddressLabel, setInitialAddressLabel] = useState<string>('');

    const [statusMessage, setStatusMessage] = useState<string>('Initializing…');

    const [currentDisplaySlug, setCurrentDisplaySlug] =
        useState<string | null>(null);
    const [activeShareableSlug, setActiveShareableSlug] =
        useState<string | null>(null);

    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

    // ---------------------------------------------------------------------------
    // Loading flags
    // ---------------------------------------------------------------------------
    const [isLoadingFromUrl, setIsLoadingFromUrl] = useState<boolean>(true);
    const [isWaitingInitialOffers, setIsWaitingInitialOffers] =
        useState<boolean>(false);
    const [isRefiningOffers, setIsRefiningOffers] = useState<boolean>(false);

    const isBlockingUi = isLoadingFromUrl || isWaitingInitialOffers;

    // ---------------------------------------------------------------------------
    // UI state
    // ---------------------------------------------------------------------------
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortOption, setSortOption] = useState<SortOptionKey>('recommended');
    const [isUpdatePromptOpen, setIsUpdatePromptOpen] = useState<boolean>(false);
    const [sharedLinkCopied, setSharedLinkCopied] = useState<boolean>(false);

    // ---------------------------------------------------------------------------
    // Filters & history
    // ---------------------------------------------------------------------------
    const { filters, setFilters, resetFilters, activeFilterCount } =
        useOfferFilters(DEFAULT_FILTERS);
    const { recentSearches, addRecentSearch, clearRecentSearches } =
        useRecentSearches();

    // Ref to ensure we only add INITIAL slug once per search session
    const hasAddedInitialRef = useRef(false);
    // Ref to store the session ID immediately for history operations
    const sessionIdRef = useRef<string | null>(null);

    // ---------------------------------------------------------------------------
    // Compare-page initialiser (slug in query-string)
    // ---------------------------------------------------------------------------
    useComparePageInitializer({
        setOriginalOffers,
        setSlug: (slug) => {
            setCurrentDisplaySlug(slug);
            setActiveShareableSlug(slug);
            if (slug) setCurrentSessionId(`shared-${slug}`);
        },
        setSortOption,
        setFilters,
        setStatus: setStatusMessage,
        setLoading: setIsLoadingFromUrl,
        setIsLoadingFromSlug: setIsLoadingFromUrl,
        setParsedAddress: setParsedAddressFromSlug,
        setInitialAddressLabel: setInitialAddressLabel,
    });
    console.log("ADRESS:" + searchInitiatedWithAddress)

    // ---------------------------------------------------------------------------
    // Offer processing (client-side sort / filters)
    // ---------------------------------------------------------------------------
    const processedOffers = useOfferProcessing(
        originalOffers,
        sortOption,
        filters,
    );

    // ---------------------------------------------------------------------------
    // Web-Socket callbacks
    // ---------------------------------------------------------------------------
    const handleWebSocketLoadingChange = useCallback(
        (waitingForInitial: boolean) => {
            setIsWaitingInitialOffers(waitingForInitial);
        },
        [],
    );

    const handlePendingOffersUpdate = useCallback((offers: Offer[] | null) => {
        setPendingOffers(offers);
        setIsRefiningOffers(Boolean(offers));
    }, []);

    const handleWebSocketSlugReceived = useCallback(
        (slug: string | null, slugType: SlugType) => {
            if (!slug) return;

            setActiveShareableSlug(slug);

            if (slugType === 'INITIAL' && !hasAddedInitialRef.current) {
                    hasAddedInitialRef.current = true;
                    setCurrentDisplaySlug(slug);

                        // -------- Add (or overwrite) history row **once** – only for INITIAL ----
                            if (
                            sessionIdRef.current &&
                            !sessionIdRef.current.startsWith('shared-') &&
                            searchInitiatedWithAddress
                        ) {
                            const url = buildUrl(slug, sortOption, filters);
                            if (url) {
                                    addRecentSearch({
                                            url,
                                            label: searchInitiatedWithAddress,
                                            sessionId: sessionIdRef.current,
                                        });
                                }
                        }
                } else if (slugType === 'FINAL') {
                setCurrentDisplaySlug(slug);
            }
        },
        [
            currentDisplaySlug,
            currentSessionId,
            searchInitiatedWithAddress,
            sortOption,
            filters,
            addRecentSearch,
        ],
    );

    const { connectWebSocket, updateWebSocketOffersRef } = useOfferWebSocket({
        parsedAddress: parsedBackendAddress,
        hasApiKey: !!GOOGLE_MAPS_API_KEY_FROM_ENV,
        onOffersReceived: (offers, phase) => {
            setOriginalOffers(offers);
            if (phase === 'INITIAL_OFFERS') setIsRefiningOffers(true);
        },
        onWebSocketSlugReceived: handleWebSocketSlugReceived,
        onLoadingChange: handleWebSocketLoadingChange,
        onStatusUpdate: setStatusMessage,
        onConnectionError: (msg) => {
            setStatusMessage(msg);
            setIsWaitingInitialOffers(false);
            setIsRefiningOffers(false);
        },
        onPendingOffersUpdate: handlePendingOffersUpdate,
        onPromptOpenChange: setIsUpdatePromptOpen,
        initialLoadingState: isLoadingFromUrl,
    });

    useEffect(() => {
        updateWebSocketOffersRef(originalOffers);
    }, [originalOffers, updateWebSocketOffersRef]);

    // ---------------------------------------------------------------------------
    // Address selection & search click
    // ---------------------------------------------------------------------------
    const handleAddressSelected = useCallback(
        (addr: ParsedAddress | null, fullText: string) => {
            setParsedBackendAddress(addr);
            if (addr) {
                const formatted = `${addr.street} ${addr.house_number}, ${addr.plz} ${addr.city}`;
                setStatusMessage(`Address ready: ${formatted}. Click Search!`);
                setSearchInitiatedWithAddress(formatted);
            } else if (fullText?.trim()) {
                setStatusMessage(
                    `Could not fully verify “${fullText}”. Ensure all address parts are clear.`,
                );
                setSearchInitiatedWithAddress(fullText.trim());
            } else {
                setStatusMessage(
                    'Enter a complete German address to compare internet plans.',
                );
                setSearchInitiatedWithAddress(null);
            }
        },
        [],
    );

    const handleSearchClick = useCallback(() => {
        hasAddedInitialRef.current = false;
        // Generate and stash the new session ID synchronously
        const newSessionId = searchInitiatedWithAddress ?? `session-${Date.now()}`;
        sessionIdRef.current = newSessionId;
        setCurrentSessionId(newSessionId);

        setOriginalOffers([]);
        setPendingOffers(null);
        setIsUpdatePromptOpen(false);
        setCurrentDisplaySlug(null);
        setActiveShareableSlug(null);

        setIsWaitingInitialOffers(true);
        setIsRefiningOffers(false);
        setIsLoadingFromUrl(false);

        connectWebSocket();
    }, [searchInitiatedWithAddress, connectWebSocket]);

    // ---------------------------------------------------------------------------
    // Accept pending offers (user clicks “Show offers”)
    // ---------------------------------------------------------------------------
    const handleShowPendingOffers = useCallback(() => {
        if (pendingOffers) {
            setOriginalOffers(pendingOffers);
            setStatusMessage(
                `Displaying updated results (${pendingOffers.length} offers).`,
            );

            // ------ Overwrite SINGLE history entry with FINAL slug -----------------
            if (
                activeShareableSlug &&
                currentSessionId &&
                !currentSessionId.startsWith('shared-') &&
                searchInitiatedWithAddress
            ) {
                const url = buildUrl(activeShareableSlug, sortOption, filters);
                if (url) {
                    addRecentSearch({
                        url,
                        label: searchInitiatedWithAddress,
                        sessionId: currentSessionId,
                    });
                }
            }
        }
        setPendingOffers(null);
        setIsUpdatePromptOpen(false);
        setIsRefiningOffers(false);
    }, [
        pendingOffers,
        activeShareableSlug,
        currentSessionId,
        searchInitiatedWithAddress,
        sortOption,
        filters,
        addRecentSearch,
    ]);

    // ---------------------------------------------------------------------------
    // Share
    // ---------------------------------------------------------------------------
    const handleShare = useCallback(async () => {
        const sharePath = buildUrl(
            activeShareableSlug,
            sortOption,
            filters,
        );
        if (!sharePath) {
            setStatusMessage('Cannot share yet – results are not ready.');
            return;
        }
        try {
            await navigator.clipboard.writeText(
                `${window.location.origin}${sharePath}`,
            );
            setSharedLinkCopied(true);
            setStatusMessage('Link copied to clipboard!');
            setTimeout(() => setSharedLinkCopied(false), 2500);
        } catch (err) {
            console.error('Clipboard error:', err);
            setStatusMessage('Failed to copy link. Please try manually.');
        }
    }, [activeShareableSlug, sortOption, filters]);

    // ---------------------------------------------------------------------------
    // When user changes FILTERS or SORT, update single history row (no duplicates)
    // ---------------------------------------------------------------------------
    const prevSortRef = useRef<SortOptionKey>(sortOption);
    const prevFiltersRef = useRef<string>(JSON.stringify(filters));

    useEffect(() => {
        if (
            !activeShareableSlug ||
            !currentSessionId ||
            currentSessionId.startsWith('shared-') ||
            !searchInitiatedWithAddress ||
            isBlockingUi
        )
            return;

        const filtersStr = JSON.stringify(filters);
        const sortChanged = prevSortRef.current !== sortOption;
        const filtersChanged = prevFiltersRef.current !== filtersStr;

        if (sortChanged || filtersChanged) {
            prevSortRef.current = sortOption;
            prevFiltersRef.current = filtersStr;

            const url = buildUrl(activeShareableSlug, sortOption, filters);
            if (url) {
                addRecentSearch({
                    url,
                    label: searchInitiatedWithAddress,
                    sessionId: currentSessionId,
                });
            }
        }
    }, [
        sortOption,
        filters,
        activeShareableSlug,
        currentSessionId,
        searchInitiatedWithAddress,
        isBlockingUi,
        addRecentSearch,
    ]);

    // ---------------------------------------------------------------------------
    // Derived enables
    // ---------------------------------------------------------------------------
    const isSearchButtonDisabled =
        isBlockingUi ||
        !parsedBackendAddress ||
        !GOOGLE_MAPS_API_KEY_FROM_ENV;

    const isShareDisabled =
        !activeShareableSlug || isBlockingUi || sharedLinkCopied;

    const areAnyOffersEverLoaded =
        originalOffers.length > 0 || pendingOffers !== null;

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0B0B2D] via-[#1C1044] to-[#3C0E4C] text-slate-100 selection:bg-indigo-500 selection:text-white">
            <main className="container mx-auto max-w-7xl px-4 py-12 sm:py-16 space-y-10 sm:space-y-12">
                <UpdatePromptDialog
                    isOpen={isUpdatePromptOpen}
                    onOpenChange={setIsUpdatePromptOpen}
                    onConfirm={handleShowPendingOffers}
                    pendingOfferCount={pendingOffers?.length ?? 0}
                />

                <PageHeader
                    statusMessage={
                        isRefiningOffers ? 'Refining search…' : statusMessage
                    }
                />

                <RecentSearchesDropdown
                    searches={recentSearches}
                    onClear={clearRecentSearches}
                    className="fixed top-4 right-4 z-50"
                />

                <AddressSearchSection
                    parsedAddress={parsedAddressFromSlug ?? undefined}
                    defaultAddressText={initialAddressLabel}
                    onAddressSelect={handleAddressSelected}
                    onSearchClick={handleSearchClick}
                    isSearchDisabled={isSearchButtonDisabled}
                    isLoading={isBlockingUi}
                    isLoadingFromSlug={isLoadingFromUrl}
                    currentSlug={currentDisplaySlug}
                />

                {(areAnyOffersEverLoaded || isBlockingUi) && (
                    <OfferListControls
                        sortOption={sortOption}
                        onSortChange={setSortOption}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        onShare={handleShare}
                        isShareDisabled={isShareDisabled}
                        sharedLinkCopied={sharedLinkCopied}
                        filters={filters}
                        onFiltersChange={setFilters}
                        activeFilterCount={activeFilterCount}
                        originalOffers={originalOffers}
                        isLoadingOffers={isBlockingUi}
                        areAnyOffersLoaded={areAnyOffersEverLoaded}
                    />
                )}

                <OfferGrid
                    offers={processedOffers}
                    isLoading={isBlockingUi}
                    viewMode={viewMode}
                    sortOption={sortOption}
                    areOriginalOffersLoaded={originalOffers.length > 0}
                    statusMessage={statusMessage}
                    onResetFilters={resetFilters}
                />
            </main>
        </div>
    );
}
