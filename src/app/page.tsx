'use client';

import React, {
    useState,
    useCallback,
    useEffect,
    useRef,
    useMemo,
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
    AVAILABLE_PROVIDER_NAMES, API_BASE_URL,
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

// API service for generating share link
async function generateShareLink(original_page_slug: string, offer_key: string): Promise<{ shared_slug: string }> {
    const response = await fetch(`${API_BASE_URL}/offers/share-link`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ original_page_slug, offer_key }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to generate share link.' }));
        throw new Error(errorData.detail || 'Failed to generate share link.');
    }
    return response.json();
}

/**
 * Builds a URL string with slug and optional sort/filter parameters.
 * @param slug The base slug for the URL.
 * @param sort The current sort option.
 * @param filters The current filters.
 * @param isSingleOfferShare If true, sort/filter params are omitted.
 * @returns The constructed URL string or null if slug is null.
 */
const buildUrl = (
    slug: string | null,
    sort: SortOptionKey,
    filters: ReturnType<typeof useOfferFilters>['filters'],
    isSingleOfferShare: boolean = false,
): string | null => {
    if (!slug) return null;
    const qp = new URLSearchParams();
    qp.set('slug', slug);

    if (!isSingleOfferShare) {
        if (sort !== 'recommended') qp.set('sort', sort);
        const fq = serializeFiltersForURL(filters);
        if (fq) {
            const fp = new URLSearchParams(fq);
            fp.forEach((v, k) => qp.set(k, v));
        }
    }

    const base =
        typeof window !== 'undefined' &&
        window.location.pathname.startsWith('/compare')
            ? '/compare' // Ensure it's just /compare, not /compare/
            : ''; // Base for other paths, ensure it doesn't create // if empty
    return `${base}?${qp.toString()}`; // Always add ? for query params
};

/**
 * Main component for the offer comparison page.
 * Manages address search, offer fetching via WebSocket, filtering, sorting,
 * and displaying offers. Also handles sharing of full page or single offers,
 * and maintains a list of recent searches.
 */
export default function ComparePage(): JSX.Element {
    const router = useRouter();
    const [hasSearchBeenPerformed, setHasSearchBeenPerformed] = useState(false);

    // const currentSearchParams = useSearchParams(); // Only if directly used for other purposes

    // Core state for offers and address
    const [originalOffers, setOriginalOffers] = useState<Offer[]>([]);
    const [pendingOffers, setPendingOffers] = useState<Offer[] | null>(null);
    const [parsedBackendAddress, setParsedBackendAddress] = useState<ParsedAddress | null>(null);
    const [searchInitiatedWithAddress, setSearchInitiatedWithAddress] = useState<string | null>(null); // Holds the string label of the address used for the current search
    const [parsedAddressFromSlug, setParsedAddressFromSlug] = useState<Address | null>(null); // Address decoded from URL slug on initial load
    const [initialAddressLabel, setInitialAddressLabel] = useState<string>(''); // For pre-filling address input from URL slug

    // UI and status state
    const [statusMessage, setStatusMessage] = useState<string>('Initializing…');
    const [currentDisplaySlug, setCurrentDisplaySlug] = useState<string | null>(null); // Slug currently reflected in UI (can be initial or final)
    const [activeShareableSlug, setActiveShareableSlug] = useState<string | null>(null); // The "list" slug (initial/final) suitable for sharing the page or as base for single offer
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null); // Tracks the logical search session for history

    // Loading flags
    const [isLoadingFromUrl, setIsLoadingFromUrl] = useState<boolean>(true); // Loading initial data based on URL slug
    const [isWaitingInitialOffers, setIsWaitingInitialOffers] = useState<boolean>(false); // Waiting for first batch of offers from WS
    const [isRefiningOffers, setIsRefiningOffers] = useState<boolean>(false); // WS is fetching more offers after initial batch
    const isBlockingUi = isLoadingFromUrl || isWaitingInitialOffers;

    // UI display options
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortOption, setSortOption] = useState<SortOptionKey>('recommended');
    const [isUpdatePromptOpen, setIsUpdatePromptOpen] = useState<boolean>(false); // Dialog for pending offers
    const [sharedLinkCopied, setSharedLinkCopied] = useState<boolean>(false); // Feedback for main "Share Page" button

    // Filters and recent searches
    const { filters, setFilters, resetFilters, activeFilterCount } = useOfferFilters(DEFAULT_FILTERS);
    const { recentSearches, addRecentSearch, clearRecentSearches } = useRecentSearches();

    // Derived values for WebSocket request
    const wantsFiber = useMemo(() => filters.connectionTypes.some((ct) => ct.toLowerCase().includes('fiber')), [filters.connectionTypes]);
    const providersForApi = useMemo(() => {
        return filters.selectedProviders.length > 0
            ? filters.selectedProviders
            : [...AVAILABLE_PROVIDER_NAMES];
    }, [filters.selectedProviders]);

    // Refs for managing WebSocket/history logic across renders
    const hasAddedInitialHistoryEntryRef = useRef(false); // Ensures history for INITIAL_OFFERS is added only once per session
    const sessionIdRef = useRef<string | null>(null); // Holds current sessionId, accessible in callbacks without causing re-renders

    // Hook for initializing page state from URL query parameters
    useComparePageInitializer({
        setOriginalOffers,
        setSlug: (slugFromUrl, addressLabelFromSlug) => { // slugFromUrl is the one from query string
            setCurrentDisplaySlug(slugFromUrl);
            setActiveShareableSlug(slugFromUrl); // On initial load, display and shareable slug are the same
            if (slugFromUrl) {
                setHasSearchBeenPerformed(true);
                // For shared links/history items, session ID is derived from slug
                setCurrentSessionId(`shared-${slugFromUrl}`);
                sessionIdRef.current = `shared-${slugFromUrl}`;
            }
            if(addressLabelFromSlug) setInitialAddressLabel(addressLabelFromSlug);
        },
        setSortOption,
        setFilters,
        setStatus: setStatusMessage,
        setLoading: setIsLoadingFromUrl, // Note: Consider renaming if distinct from setIsLoadingFromSlug
        setIsLoadingFromSlug: setIsLoadingFromUrl,
        setParsedAddress: setParsedAddressFromSlug,
        setInitialAddressLabel: setInitialAddressLabel, // Ensure this is correctly passed if needed
    });

    // Process offers (apply client-side sorting and filtering)
    const processedOffers = useOfferProcessing(originalOffers, sortOption, filters);

    // WebSocket event handlers
    const handleWebSocketLoadingChange = useCallback((waitingForInitial: boolean) => {
        setIsWaitingInitialOffers(waitingForInitial);
    }, []);

    const handlePendingOffersUpdate = useCallback((offers: Offer[] | null) => {
        setPendingOffers(offers);
        setIsRefiningOffers(Boolean(offers));
    }, []);

    const handleWebSocketSlugReceived = useCallback(
        (slug: string | null, slugType: SlugType) => {
            if (!slug) return;

            // The slug from WebSocket (initial or final) becomes the active shareable "list" slug.
            setActiveShareableSlug(slug);
            setCurrentDisplaySlug(slug); // Also update the display slug

            const currentSearchLabel = searchInitiatedWithAddress; // Capture from closure
            const currentSessionForHistory = sessionIdRef.current; // Use ref for most up-to-date

            if (currentSessionForHistory && !currentSessionForHistory.startsWith('shared-') && currentSearchLabel) {
                const url = buildUrl(slug, sortOption, filters, false);
                if (url) {
                    if (slugType === 'INITIAL' && !hasAddedInitialHistoryEntryRef.current) {
                        hasAddedInitialHistoryEntryRef.current = true; // Mark that initial entry is made
                        addRecentSearch({ url, label: currentSearchLabel, sessionId: currentSessionForHistory });
                    } else if (slugType === 'FINAL') {
                        // Always update for FINAL, as it might be a refinement or the first complete set
                        addRecentSearch({ url, label: currentSearchLabel, sessionId: currentSessionForHistory });
                    }
                }
            }
        },
        [searchInitiatedWithAddress, sortOption, filters, addRecentSearch] // Dependencies of useCallback
    );

    // WebSocket connection and lifecycle management
    const { connectWebSocket, updateWebSocketOffersRef } = useOfferWebSocket({
        parsedAddress: parsedBackendAddress,
        hasApiKey: !!GOOGLE_MAPS_API_KEY_FROM_ENV,
        providers: providersForApi,
        wantsFiber,
        onOffersReceived: (offers, phase) => {
            setOriginalOffers(offers);
            if (phase === 'INITIAL_OFFERS') setIsRefiningOffers(true);
            else if (phase === 'FINAL_OFFERS') setIsRefiningOffers(false);
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
        initialLoadingState: isLoadingFromUrl, // Pass down initial loading state
    });

    // Keep WebSocket hook aware of current originalOffers if it needs them
    useEffect(() => {
        updateWebSocketOffersRef(originalOffers);
    }, [originalOffers, updateWebSocketOffersRef]);

    // Address selection handler
    const handleAddressSelected = useCallback((addr: ParsedAddress | null, fullText: string) => {
        setParsedBackendAddress(addr);
        const addressText = addr
            ? `${addr.street} ${addr.house_number}, ${addr.plz} ${addr.city}`
            : fullText.trim();

        if (addressText) {
            setSearchInitiatedWithAddress(addressText); // Set label for current search
            setStatusMessage(addr ? `Address ready: ${addressText}. Click Search!` : `Could not fully verify “${addressText}”. Ensure all parts are clear.`);
        } else {
            setSearchInitiatedWithAddress(null);
            setStatusMessage('Enter a complete German address to compare internet plans.');
        }
    }, []);

    // Search button click handler
    const handleSearchClick = useCallback(() => {
        if (!searchInitiatedWithAddress && !parsedBackendAddress) {
            setStatusMessage("Please select a valid address first.");
            return;
        }

        // Essential: Reset state for a new search
        hasAddedInitialHistoryEntryRef.current = false; // Reset for new history entry
        const newSessionId = searchInitiatedWithAddress || `session-${Date.now()}`; // Use address text or timestamp for session ID
        sessionIdRef.current = newSessionId;
        setCurrentSessionId(newSessionId);

        setOriginalOffers([]);
        setPendingOffers(null);
        setIsUpdatePromptOpen(false);
        setCurrentDisplaySlug(null); // Clear previous slugs
        setActiveShareableSlug(null); // This is key for history and sharing logic

        setIsLoadingFromUrl(false); // No longer loading from URL if new search starts
        setIsWaitingInitialOffers(true); // Expecting initial offers
        setIsRefiningOffers(false);
        setHasSearchBeenPerformed(true);
        connectWebSocket(); // Initiate WS connection for new search
    }, [searchInitiatedWithAddress, parsedBackendAddress, connectWebSocket]);

    // Handler for accepting pending offers from update prompt
    const handleShowPendingOffers = useCallback(() => {
        if (pendingOffers) {
            setOriginalOffers(pendingOffers);
            setStatusMessage(`Displaying updated results (${pendingOffers.length} offers).`);

            // Update history if this action finalizes a search session with a new set of offers
            const currentSearchLabel = searchInitiatedWithAddress;
            const currentSessionForHistory = sessionIdRef.current;
            if (activeShareableSlug && currentSessionForHistory && !currentSessionForHistory.startsWith('shared-') && currentSearchLabel) {
                const url = buildUrl(activeShareableSlug, sortOption, filters, false);
                if (url) addRecentSearch({ url, label: currentSearchLabel, sessionId: currentSessionForHistory });
            }
        }
        setPendingOffers(null);
        setIsUpdatePromptOpen(false);
        setIsRefiningOffers(false);
    }, [pendingOffers, activeShareableSlug, searchInitiatedWithAddress, sortOption, filters, addRecentSearch]);

    // Handler for sharing the entire page/current offer list
    const handleSharePage = useCallback(async () => {
        if (!activeShareableSlug) {
            setStatusMessage('Cannot share yet – results are not ready.');
            return;
        }
        // Prevent sharing a "list" that is actually a single offer view, unless intended.
        // This check can be refined if single-offer slugs have a distinct pattern or flag.
        if (originalOffers.length === 1 && activeShareableSlug === currentDisplaySlug) {
            // Potentially, this is a single offer view. Prompt to share the specific offer?
            // For now, assume activeShareableSlug is for the list.
        }

        const sharePath = buildUrl(activeShareableSlug, sortOption, filters, false);
        if (!sharePath) {
            setStatusMessage('Cannot share page – results are not ready.');
            return;
        }
        try {
            await navigator.clipboard.writeText(`${window.location.origin}${sharePath}`);
            setSharedLinkCopied(true);
            setStatusMessage('Page link copied to clipboard!');
            setTimeout(() => setSharedLinkCopied(false), 2500);
        } catch (err) {
            console.error('Clipboard error:', err);
            setStatusMessage('Failed to copy page link. Please try manually.');
        }
    }, [activeShareableSlug, sortOption, filters, originalOffers.length, currentDisplaySlug]);

    // Handler for sharing a single specific offer
    const handleShareSingleOffer = useCallback(async (offer: Offer) => {
        if (!activeShareableSlug) { // activeShareableSlug should be the LIST slug
            setStatusMessage('Cannot share offer: main offer list context is missing.');
            return;
        }
        const offer_key = `${offer.provider}:${offer.product_id}`;
        setStatusMessage(`Generating share link for ${offer.plan_name}...`);
        try {
            const { shared_slug: newSingleOfferSlug } = await generateShareLink(activeShareableSlug, offer_key);
            // For single offer links, sort/filters are not typically part of the shared state from THIS offer.
            // So, buildUrl is called with isSingleOfferShare = true.
            const singleOfferShareUrl = buildUrl(newSingleOfferSlug, 'recommended', DEFAULT_FILTERS, true);

            if (!singleOfferShareUrl) {
                setStatusMessage('Failed to construct share URL.');
                return;
            }

            await navigator.clipboard.writeText(`${window.location.origin}${singleOfferShareUrl}`);
            setStatusMessage(`Link for ${offer.plan_name} copied!`);
        } catch (error: any) {
            console.error('Failed to generate or copy single offer share link:', error);
            setStatusMessage(error.message || 'Could not share offer. Please try again.');
        }
    }, [activeShareableSlug]); // sortOption, filters removed as deps, as they are not used for single offer share link structure

    // Refs to store previous sort/filter state for history updates
    const prevSortRef = useRef<SortOptionKey>(sortOption);
    const prevFiltersRef = useRef<string>(JSON.stringify(filters));

    // Effect to update history when sort or filters change for an active search session
    useEffect(() => {
        // Guards: Only update history if it's a user-initiated search session and results are loaded
        if (
            !activeShareableSlug ||
            !currentSessionId || currentSessionId.startsWith('shared-') || // Don't update history for shared links
            !searchInitiatedWithAddress || // Ensure it's a search tied to an address
            isBlockingUi // Don't update while loading
        ) {
            return;
        }

        const filtersStr = JSON.stringify(filters);
        const sortChanged = prevSortRef.current !== sortOption;
        const filtersChanged = prevFiltersRef.current !== filtersStr;

        if (sortChanged || filtersChanged) {
            prevSortRef.current = sortOption; // Update refs for next comparison
            prevFiltersRef.current = filtersStr;

            const url = buildUrl(activeShareableSlug, sortOption, filters, false);
            if (url) {
                addRecentSearch({
                    url,
                    label: searchInitiatedWithAddress,
                    sessionId: currentSessionId,
                });
            }
        }
    }, [
        sortOption, filters, activeShareableSlug, currentSessionId,
        searchInitiatedWithAddress, isBlockingUi, addRecentSearch
    ]);

    // Derived booleans for disabling UI elements
    const isSearchButtonDisabled = isBlockingUi || !parsedBackendAddress || !GOOGLE_MAPS_API_KEY_FROM_ENV;
    const isSharePageDisabled = !activeShareableSlug || isBlockingUi || sharedLinkCopied ||
        (originalOffers.length === 1 && currentDisplaySlug === activeShareableSlug); // Heuristic for single offer view

    const areAnyOffersEverLoaded = originalOffers.length > 0 || pendingOffers !== null;
    const isSingleOfferView = originalOffers.length === 1 && hasSearchBeenPerformed && !isWaitingInitialOffers && !isLoadingFromUrl && !isRefiningOffers;


    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0B0B2D] via-[#1C1044] to-[#3C0E4C] text-slate-100 selection:bg-indigo-500 selection:text-white">
            <main className="container mx-auto max-w-7xl px-4 py-12 sm:py-16 space-y-10 sm:space-y-12">
                <UpdatePromptDialog
                    isOpen={isUpdatePromptOpen}
                    onOpenChange={setIsUpdatePromptOpen}
                    onConfirm={handleShowPendingOffers}
                    pendingOfferCount={pendingOffers?.length ?? 0}
                />
                <PageHeader statusMessage={isRefiningOffers ? 'Refining search…' : statusMessage} />
                <RecentSearchesDropdown searches={recentSearches} onClear={clearRecentSearches} className="fixed top-4 right-4 z-50" />
                <AddressSearchSection
                    parsedAddress={parsedAddressFromSlug ?? undefined} // Use the address from slug for initial render
                    defaultAddressText={initialAddressLabel} // Use label from slug
                    onAddressSelect={handleAddressSelected}
                    onSearchClick={handleSearchClick}
                    isSearchDisabled={isSearchButtonDisabled}
                    isLoading={isBlockingUi}
                    isLoadingFromSlug={isLoadingFromUrl} // Pass this to show appropriate UI in AddressSearchSection
                    currentSlug={currentDisplaySlug}
                />
                <OfferListControls
                    sortOption={sortOption}
                    onSortChange={setSortOption}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    onShare={handleSharePage}
                    isShareDisabled={isSharePageDisabled}
                    sharedLinkCopied={sharedLinkCopied}
                    filters={filters}
                    onFiltersChange={setFilters}
                    activeFilterCount={activeFilterCount}
                    originalOffers={originalOffers}
                    isLoadingOffers={isWaitingInitialOffers || isRefiningOffers} // Consider isRefiningOffers as well
                    areAnyOffersLoaded={areAnyOffersEverLoaded}
                    isSingleOfferView={isSingleOfferView}
                />
                <OfferGrid
                    offers={processedOffers}
                    isLoading={isBlockingUi || isRefiningOffers} // Grid is loading if UI is blocked or refining
                    viewMode={viewMode}
                    areOriginalOffersLoaded={originalOffers.length > 0}
                    statusMessage={statusMessage}
                    onResetFilters={resetFilters}
                    hasSearchBeenPerformed={hasSearchBeenPerformed}
                    onShareOffer={handleShareSingleOffer}
                    activeShareableSlug={activeShareableSlug}
                />
            </main>
        </div>
    );
}