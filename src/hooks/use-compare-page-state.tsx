"use client";

/**
 * React hook to encapsulate state management, side-effects, and business logic
 * for the ComparePage component.
 *
 * Responsibilities include WebSocket orchestration, URL synchronization, filter logic,
 * search and sharing workflows, history persistence, and UI state derivation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Address } from "@/types/address";
import type { Offer } from "@/types/offer";
import { ParsedAddress } from "@/components/compare/address-autocomplete-input";
import { SortOptionKey } from "@/types/sort-option-key";
import { useOfferFilters } from "@/hooks/use-offer-filters";
import { AVAILABLE_PROVIDER_NAMES, DEFAULT_FILTERS, GOOGLE_MAPS_API_KEY_FROM_ENV } from "@/config/constants";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { useComparePageInitializer } from "@/hooks/use-compare-page-initializer";
import { SlugType, useOfferWebSocket } from "@/hooks/use-offer-websocket";
import { useOfferProcessing } from "@/hooks/use-offer-processing";
import { buildUrl } from "@/utils/build-url";
import { generateShareLink } from "@/utils/generate-share-link";
import { toast as sonnerToast } from "sonner";
import { ViewMode } from "@/types/view-mode";

/**
 * Defines the UI state and action handlers for the ComparePage component.
 *
 * @property state - Immutable UI state values and computed helper flags.
 * @property actions - Operations for initiating searches, updating filters, sharing results, and UI interactions.
 */
export interface ComparePageState {
    /* ──────────────── state ──────────────── */
    state: {
        /* status / lifecycle */
        mainStatusMessage: string; // NEW
        currentOfferCount: number | null; // NEW
        isGloballyLoading: boolean; // NEW
        isSpecificallyRefining: boolean; // NEW
        statusMessage: string;
        isBlockingUi: boolean;
        isLoadingFromUrl: boolean;
        isWaitingInitialOffers: boolean;
        isRefiningOffers: boolean;
        isUpdatePromptOpen: boolean;

        /* data */
        originalOffers: Offer[];
        processedOffers: Offer[];
        pendingOffers: Offer[] | null;
        recentSearches: ReturnType<typeof useRecentSearches>["recentSearches"];
        filters: ReturnType<typeof useOfferFilters>["filters"];
        sortOption: SortOptionKey;
        viewMode: ViewMode;

        /* meta / sharing */
        currentDisplaySlug: string | null;
        activeShareableSlug: string | null;
        sharedLinkCopied: boolean;
        activeFilterCount: number;

        /* address */
        parsedAddressFromSlug: Address | null;
        initialAddressLabel: string;

        /* derived helpers */
        isSearchButtonDisabled: boolean;
        isSharePageDisabled: boolean;
        hasSearchBeenPerformed: boolean;
        areAnyOffersEverLoaded: boolean;
        isSingleOfferView: boolean;
    };

    /* ──────────────── actions ──────────────── */
    actions: {
        /* address & search */
        handleAddressSelected: (
            addr: ParsedAddress | null,
            rawText: string,
        ) => void;
        handleSearchClick: () => void;

        /* offer sharing */
        handleSharePage: () => void;
        handleShareSingleOffer: (offer: Offer) => void;

        /* update prompt */
        handleShowPendingOffers: () => void;
        setIsUpdatePromptOpen: (open: boolean) => void;

        /* ui */
        setSortOption: (opt: SortOptionKey) => void;
        setViewMode: (mode: ViewMode) => void;
        setFilters: ReturnType<typeof useOfferFilters>["setFilters"];
        resetFilters: ReturnType<typeof useOfferFilters>["resetFilters"];
        clearRecentSearches: ReturnType<
            typeof useRecentSearches
        >["clearRecentSearches"];
    };
}

/**
 * Hook to initialize and manage ComparePage state and actions.
 *
 * Integrates URL parameters, WebSocket data flow, filter management, and user interactions,
 * while maintaining navigation history and shareable slugs.
 *
 * @returns ComparePageState - Structured access to state values and action methods.
 */
export function useComparePageState(): ComparePageState {
    /**
     * Initialize state and references for search lifecycle, offer data, and UI control flags.
     */
    const searchIsActiveRef = useRef<boolean>(false);
    const currentSearchSlugRef = useRef<string | null>(null);
    const initialPageLoadProcessedRef = useRef<boolean>(false);
    const [hasSearchBeenPerformed, setHasSearchBeenPerformed] = useState<boolean>(false);
    const [originalOffers, setOriginalOffers] = useState<Offer[]>([]);
    const [pendingOffers, setPendingOffers] = useState<Offer[] | null>(null);
    const [pendingSlug,   setPendingSlug]   = useState<string | null>(null);
    const [parsedBackendAddress, setParsedBackendAddress] = useState<ParsedAddress | null>(null);
    const [parsedAddressFromSlug, setParsedAddressFromSlug] = useState<Address | null>(null);
    const [initialAddressLabel, setInitialAddressLabel] = useState<string>("");
    const [mainStatusMessage, setMainStatusMessage] = useState<string>("Initializing…");
    const [currentDisplaySlug, setCurrentDisplaySlug] = useState<string | null>(null);
    const [activeShareableSlug, setActiveShareableSlug] = useState<string | null>(null);
    const [isLoadingFromUrl, setIsLoadingFromUrl] = useState<boolean>(true);
    const [isWaitingInitialOffers, setIsWaitingInitialOffers] = useState<boolean>(false);
    const [isRefiningOffers, setIsRefiningOffers] = useState<boolean>(false);
    const isBlockingUi = isLoadingFromUrl || isWaitingInitialOffers;
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [sortOption, setSortOption] = useState<SortOptionKey>("recommended");
    const [isUpdatePromptOpen, setIsUpdatePromptOpen] = useState<boolean>(false);
    const [sharedLinkCopied, setSharedLinkCopied] = useState<boolean>(false);

    /**
     * Configure routing utilities for navigation and path tracking.
     */
    const router = useRouter();
    const pathname = usePathname();
    const notify = useCallback(
        (text: string, duration = 3000) =>
            sonnerToast(<p className="text-white">{text}</p>, {
                duration,
                id: `toast-${Date.now()}`,
            }),
        [],
    );

    /**
     * Manage filters and recent search history.
     */
    const { filters, setFilters, resetFilters, activeFilterCount } = useOfferFilters(DEFAULT_FILTERS);
    const {
        recentSearches,
        addRecentSearch,
        updateSearchSlug,
        clearRecentSearches,
    } = useRecentSearches();

    /**
     * Compute memoized values for API provider selection and fiber preference.
     */
    const wantsFiber = useMemo(
        () =>
            filters.connectionTypes.some((ct) =>
                ct.toLowerCase().includes("fiber"),
            ),
        [filters.connectionTypes],
    );
    const providersForApi = useMemo(
        () =>
            filters.selectedProviders.length > 0
                ? filters.selectedProviders
                : [...AVAILABLE_PROVIDER_NAMES],
        [filters.selectedProviders],
    );

    /**
     * Initialize history and session references for slug tracking and refinement state.
     */
    const hasAddedInitialHistoryEntryRef = useRef<boolean>(false);
    const sessionIdRef = useRef<string | null>(null);
    const hasTriggeredRefineRef = useRef<boolean>(false);

    /**
     * Initialize page state based on URL slug and shared comparisons.
     */
    useComparePageInitializer({
        setOriginalOffersAction: (offers: Offer[]) => {
            setOriginalOffers(offers);
            if (isLoadingFromUrl) {
                setPendingOffers(null);
                setIsUpdatePromptOpen(false);
            }
        },
        setSlugAction: (slug: string | null) => {
            const isOtherSlug = slug !== currentSearchSlugRef.current;

            if (searchIsActiveRef.current && slug !== null && isOtherSlug) {
                searchIsActiveRef.current = false;
                abortCurrentWebSocket();
                setIsWaitingInitialOffers(false);
                setIsRefiningOffers(false);
            }
            setCurrentDisplaySlug(slug);
            setActiveShareableSlug(slug);
            if (slug) {
                setHasSearchBeenPerformed(true);
                if (!initialPageLoadProcessedRef.current && isLoadingFromUrl) {
                    sessionIdRef.current = `shared-${slug}`;
                }
            }
            if (!initialPageLoadProcessedRef.current) {
                initialPageLoadProcessedRef.current = true;
            }
        },
        setSortOptionAction: setSortOption,
        setFiltersAction: setFilters,
        setStatusAction: (message: string) => {
            setMainStatusMessage(message);
            if (message.startsWith("Enter an address") && !initialPageLoadProcessedRef.current) {
                initialPageLoadProcessedRef.current = true;
            }
        },
        setLoadingAction: setIsLoadingFromUrl,
        setIsLoadingFromSlugAction: setIsLoadingFromUrl,
        setParsedAddress: setParsedAddressFromSlug,
        setInitialAddressLabel: (label: string) =>
            setInitialAddressLabel(label),
    });

    /**
     * Process and filter incoming offers based on sort order and active filters.
     */
    const processedOffers = useOfferProcessing(
        originalOffers,
        sortOption,
        filters,
    );

    /**
     * Handle WebSocket connections for live offer updates and pending-offer notifications.
     */
    const handleWebSocketLoadingChange = useCallback((waiting: boolean) => {
        setIsWaitingInitialOffers(waiting);
    }, []);

    /** called by Web-Socket: save offers **and** the yet-to-be-applied slug */
    const handlePendingOffersUpdate = useCallback(
        (offers: Offer[] | null, slug: string | null) => {
            setPendingOffers(offers);
            setPendingSlug(slug);
            setIsRefiningOffers(false);          // stop spinner immediately
        },
        [],
    );

    const handleWebSocketSlugReceived = useCallback(
        (slug: string | null, slugType: SlugType) => {
            // If search is not active and this isn't a shared slug being processed, ignore.
            // (Shared slugs initial load is typically handled by useComparePageInitializer based on URL)
            if (!searchIsActiveRef.current && slugType !== "SHARED") {
                return;
            }
            if (!slug) {
                return;
            }

            currentSearchSlugRef.current = slug;
            setActiveShareableSlug(slug); // Keep activeShareableSlug in sync
            setCurrentDisplaySlug(slug);  // Update display slug

            const currentSearchLabel = sessionIdRef.current?.startsWith("shared-")
                ? null
                : sessionIdRef.current;

            // Update recent searches history
            if (currentSearchLabel) {
                const urlForHistory = buildUrl(slug, sortOption, filters, false);
                if (urlForHistory) {
                    if (slugType === "INITIAL" && !hasAddedInitialHistoryEntryRef.current) {
                        hasAddedInitialHistoryEntryRef.current = true;
                        addRecentSearch({
                            url: urlForHistory,
                            label: currentSearchLabel,
                            sessionId: currentSearchLabel,
                        });
                    } else if (slugType === "FINAL") {
                        updateSearchSlug(currentSearchLabel, urlForHistory);
                    }
                }
            }

            // Synchronize browser URL if we are on the compare page and an active search yielded this slug.
            // This prevents unnecessary URL updates if the user navigated away or if it's not from an active search.
            const isCurrentlyOnComparePage = window.location.pathname === pathname;
            if (isCurrentlyOnComparePage && searchIsActiveRef.current) {
                const newTargetUrlPathAndQuery = buildUrl(slug, sortOption, filters, false);
                if (newTargetUrlPathAndQuery) {
                    const currentBrowserUrlPathAndQuery = window.location.pathname + window.location.search;

                    // THE CRITICAL CHANGE: Only call router.replace if the target URL is actually different.
                    // This prevents the address bar flicker if the URL isn't truly changing.
                    if (newTargetUrlPathAndQuery !== currentBrowserUrlPathAndQuery) {
                        router.replace(newTargetUrlPathAndQuery, { scroll: false });
                    }
                }
            }
        },
        [
            sortOption, // sortOption and filters are used in buildUrl
            filters,
            addRecentSearch,
            updateSearchSlug,
            router,
            pathname,
            // searchIsActiveRef is a ref, its .current value is used directly, so it's not a dependency here.
            // hasAddedInitialHistoryEntryRef is also a ref.
            // sessionIdRef is also a ref.
        ],
    );

    const { connectWebSocket, updateWebSocketOffersRef, abortCurrentWebSocket } = useOfferWebSocket({
        parsedAddress: parsedBackendAddress,
        hasApiKey: Boolean(GOOGLE_MAPS_API_KEY_FROM_ENV),
        providers: providersForApi,
        wantsFiber,
        onOffersReceivedAction: (offers, phase, willRefine) => {
            if (phase === "INITIAL_OFFERS" || (phase === "FINAL_OFFERS" && !isUpdatePromptOpen)) {
                setOriginalOffers(offers);
            }

            if (phase === "INITIAL_OFFERS") {
                if (willRefine) {
                    setIsRefiningOffers(true);
                    if (!hasTriggeredRefineRef.current) {
                        sonnerToast(
                            <div>
                                <p className="font-semibold text-white">Refining your search…</p>
                                <p className="text-slate-400">We&#39;re polishing the results while you browse.</p>
                            </div>,
                            { duration: 5_000 },
                        );
                        hasTriggeredRefineRef.current = true;
                    }
                } else { // No refinement phase after initial offers
                    setIsRefiningOffers(false);
                    hasTriggeredRefineRef.current = false;
                    searchIsActiveRef.current = false; // Search considered complete
                }
            } else if (phase === "FINAL_OFFERS") {
                setIsRefiningOffers(false);
                hasTriggeredRefineRef.current = false;
                searchIsActiveRef.current = false; // Search complete
            }
        },
        onWebSocketSlugReceivedAction: handleWebSocketSlugReceived,
        onLoadingChangeAction: handleWebSocketLoadingChange,
        onStatusUpdateAction: setMainStatusMessage,
        onConnectionErrorAction: (msg) => {
            setMainStatusMessage(msg);
            setIsWaitingInitialOffers(false);
            setIsRefiningOffers(false);
            searchIsActiveRef.current = false; // Ensure search is marked inactive on error
        },
        onPendingOffersUpdateAction: handlePendingOffersUpdate,
        onPromptOpenChangeAction: setIsUpdatePromptOpen,
        initialLoadingState: isLoadingFromUrl, // Pass down initial loading state
    });

    /**
     * Synchronize originalOffers into WebSocket reference for update detection.
     */
    useEffect(() => {
        updateWebSocketOffersRef(originalOffers);
    }, [originalOffers, updateWebSocketOffersRef]);

    /**
     * Update parsed address and status message based on user selection.
     */
    const handleAddressSelected = useCallback(
        (addr: ParsedAddress | null, fullText: string) => {
            setParsedBackendAddress(addr);
            const addressText = addr
                ? `${addr.street} ${addr.house_number}, ${addr.plz} ${addr.city}`
                : fullText.trim();

            setInitialAddressLabel(addressText);
            if (addressText) {
                sessionIdRef.current = addressText; // Use full address text as session ID for this search
                setMainStatusMessage(
                    addr
                        ? `Address ready: ${addressText}. Click Search!`
                        : `Could not fully verify “${addressText}”. Ensure all parts are clear.`,
                );
            } else {
                sessionIdRef.current = null;
                setMainStatusMessage(
                    "Enter a complete German address to compare internet plans.",
                );
            }
        },
        [setMainStatusMessage],
    );

    /**
     * Validate input, reset state, and initiate WebSocket search.
     */
    const handleSearchClick = useCallback(() => {
        abortCurrentWebSocket(); // Abort any ongoing WebSocket connection
        if (!parsedBackendAddress && !sessionIdRef.current?.trim()) { // Check sessionIdRef as fallback if parsedBackendAddress is null
            setMainStatusMessage("Please select a valid address first.");
            return;
        }

        initialPageLoadProcessedRef.current = true; // Mark that a search action has modified the page state
        // Reset URL to base path, clearing old slug/sort/filters for a new search.
        // This is part of the "remove" in "remove and add" flicker if the search results in the same effective URL.
        // Avoiding this specific `replace` if the search is identical is complex as slug isn't known yet.
        router.replace(pathname, { scroll: false });

        hasAddedInitialHistoryEntryRef.current = false; // Reset history flag for the new search
        searchIsActiveRef.current = true; // Mark search as active

        // If no sessionId has been assigned yet, generate a proper UUID
        if (!sessionIdRef.current) {
            sessionIdRef.current = crypto.randomUUID();
        }
        currentSearchSlugRef.current = null; // Clear previous search slug reference

        // Reset offer states
        setOriginalOffers([]);
        setPendingOffers(null);
        setIsUpdatePromptOpen(false);
        setCurrentDisplaySlug(null); // Clear display slug
        setActiveShareableSlug(null); // Clear shareable slug
        setIsLoadingFromUrl(false); // Not loading from URL anymore
        setIsWaitingInitialOffers(true); // Now waiting for initial offers from WebSocket
        setIsRefiningOffers(false); // Reset refining state
        setHasSearchBeenPerformed(true); // Mark that a search has been performed
        hasTriggeredRefineRef.current = false; // Reset refine notification flag

        connectWebSocket(); // Initiate WebSocket connection for the new search
    }, [parsedBackendAddress, connectWebSocket, router, pathname, abortCurrentWebSocket, setMainStatusMessage]);


    /**
     * Apply pending offers and update URL and history accordingly.
     */
    const handleShowPendingOffers = useCallback(() => {
        if (pendingOffers) {
            setOriginalOffers(pendingOffers); // Update original offers with pending ones
            /* ─── slug & URL switch happens *now* ─── */
            if (pendingSlug && pendingSlug !== currentDisplaySlug) {
                setCurrentDisplaySlug(pendingSlug);
                setActiveShareableSlug(pendingSlug);

                const newUrl = buildUrl(pendingSlug, sortOption, filters, false);
                if (newUrl) {
                    router.replace(newUrl, { scroll: false });
                    /* update existing entry in recent-search list */
                    if (sessionIdRef.current)
                        updateSearchSlug(sessionIdRef.current, newUrl);
                }
            }

        }
        setPendingOffers(null); // Clear pending offers
        setPendingSlug(null);
        setIsUpdatePromptOpen(false); // Close prompt
        setIsRefiningOffers(false); // Ensure refining is off
    }, [
        pendingOffers,
        pendingSlug,
        currentDisplaySlug,
        activeShareableSlug,
        sortOption,
        filters,
        addRecentSearch,
        setMainStatusMessage,
        router,
        updateSearchSlug,
        // sessionIdRef is a ref
    ]);

    /**
     * Generate and copy shareable link for the entire offer list.
     */
    const handleSharePage = useCallback(async () => {
        if (!activeShareableSlug) {
            notify("Cannot share yet – results are not ready.", 4000);
            return;
        }
        const sharePath = buildUrl(
            activeShareableSlug,
            sortOption,
            filters,
            false,
        );
        if (!sharePath) {
            notify("Cannot share yet – results are not ready.", 4000);
            return;
        }
        try {
            await navigator.clipboard.writeText(
                `${window.location.origin}${sharePath}`,
            );
            setSharedLinkCopied(true);
            notify("🔗\u00A0Page link copied to clipboard!");
            setTimeout(() => setSharedLinkCopied(false), 2500);
        } catch {
            notify("Failed to copy page link. Please try manually.", 5000);
        }
    }, [activeShareableSlug, sortOption, filters, notify]);

    /**
     * Generate and copy shareable link for a single offer.
     */
    const handleShareSingleOffer = useCallback(
        async (offer: Offer) => {
            if (!activeShareableSlug) {
                notify(
                    "Cannot share offer: main list context is missing.",
                    4000,
                );
                return;
            }
            const offerKey = `${offer.provider}:${offer.product_id}`;
            await sonnerToast.promise(
                generateShareLink(activeShareableSlug, offerKey),
                {
                    loading: `Creating link for “${offer.plan_name}”…`,
                    success: async ({ shared_slug }) => {
                        const url = buildUrl(
                            shared_slug,
                            "recommended", // Single offer links default to recommended sort
                            DEFAULT_FILTERS, // And default filters
                            true, // Mark as single offer view for URL
                        );
                        await navigator.clipboard.writeText(
                            `${window.location.origin}${url}`,
                        );
                        return `Link for “${offer.plan_name}” copied!`;
                    },
                    error: (e) =>
                        (e as Error)?.message ??
                        "Could not share offer. Please try again.",
                },
            );
        },
        [activeShareableSlug, notify],
    );

    /**
     * Effect: persist recent search history on sort/filter changes *after* a search is complete.
     * This also implicitly updates the URL if the `activeShareableSlug` is stable and sort/filters change.
     */
    const prevSortRef = useRef<SortOptionKey>(sortOption);
    const prevFiltersJsonRef = useRef<string>(JSON.stringify(filters)); // Store serialized filters

    useEffect(() => {
        const currentFiltersJson = JSON.stringify(filters);
        // Conditions for updating history/URL:
        // - A shareable slug must exist (meaning a search has been completed or loaded).
        // - It must be a user-initiated session (not a "shared-..." session).
        // - UI should not be in a blocking state (loading, initial offers wait).
        // - Search should not be currently active (i.e., this is for post-search adjustments).
        // - initialPageLoadProcessedRef indicates that initial setup is done, preventing premature updates.
        if (
            activeShareableSlug &&
            sessionIdRef.current &&
            !sessionIdRef.current.startsWith("shared-") &&
            !isBlockingUi &&
            !searchIsActiveRef.current &&
            initialPageLoadProcessedRef.current
        ) {
            const sortChanged = prevSortRef.current !== sortOption;
            const filtersChanged = prevFiltersJsonRef.current !== currentFiltersJson;

            if (sortChanged || filtersChanged) {
                prevSortRef.current = sortOption;
                prevFiltersJsonRef.current = currentFiltersJson;

                const newUrlPathAndQuery = buildUrl(
                    activeShareableSlug,
                    sortOption,
                    filters,
                    false,
                );

                if (newUrlPathAndQuery) {
                    // Update recent search history
                    addRecentSearch({
                        url: newUrlPathAndQuery,
                        label: sessionIdRef.current, // Use the existing session label
                        sessionId: sessionIdRef.current,
                    });

                    // Update browser URL if it changed due to sort/filter
                    const currentBrowserUrlPathAndQuery = window.location.pathname + window.location.search;
                    if (newUrlPathAndQuery !== currentBrowserUrlPathAndQuery) {
                        router.replace(newUrlPathAndQuery, { scroll: false });
                    }
                }
            }
        } else {
            // Ensure refs are up-to-date even if conditions for update are not met
            // to prevent stale comparisons on next valid run.
            prevSortRef.current = sortOption;
            prevFiltersJsonRef.current = currentFiltersJson;
        }
    }, [
        sortOption,
        filters, // Note: `filters` object itself is a dependency. JSON string is for comparison.
        activeShareableSlug,
        isBlockingUi,
        addRecentSearch,
        router, // router and pathname are stable from Next.js hooks
        pathname,
        // Refs (sessionIdRef, searchIsActiveRef, initialPageLoadProcessedRef) are not in deps array.
    ]);


    /**
     * Effect: reset refining state if currentDisplaySlug changes and it's not matching
     * the slug of an active search, or if search is no longer active.
     * This helps ensure the "refining" UI doesn't stick if navigating or loading a new slug.
     */
    useEffect(() => {
        if (currentDisplaySlug) { // If there's a slug being displayed
            if (
                currentDisplaySlug !== currentSearchSlugRef.current || // And it's different from the active search's slug
                !searchIsActiveRef.current // Or the search is no longer active
            ) {
                setIsRefiningOffers(false); // Then stop showing "refining"
            }
        } else { // If no slug is displayed (e.g., new search before slug received)
            setIsRefiningOffers(false); // Also ensure refining is off
        }
    }, [currentDisplaySlug]); // Depends on currentDisplaySlug and refs currentSearchSlugRef, searchIsActiveRef

    /**
     * Derived computed state values for UI display.
     */
    const currentOfferCountForDisplay = useMemo(() => {
        if (originalOffers.length > 0) return originalOffers.length;
        if (hasSearchBeenPerformed && !isWaitingInitialOffers && !isLoadingFromUrl && !isRefiningOffers) {
            return 0;
        }
        return null;
    }, [originalOffers, hasSearchBeenPerformed, isWaitingInitialOffers, isLoadingFromUrl, isRefiningOffers]);

    const isGloballyLoading = useMemo(() => {
        return isLoadingFromUrl || isWaitingInitialOffers;
    }, [isLoadingFromUrl, isWaitingInitialOffers]);

    /**
     * Computed UI flags for control enablement and view mode.
     */
    const isSearchButtonDisabled =
        isBlockingUi || (!parsedBackendAddress && !initialAddressLabel.trim()) || !GOOGLE_MAPS_API_KEY_FROM_ENV;
    const isSharePageDisabled =
        !activeShareableSlug ||
        isBlockingUi ||
        sharedLinkCopied ||
        (originalOffers.length === 1 &&
            currentDisplaySlug === activeShareableSlug); // Disable if single offer view from shared link
    const areAnyOffersEverLoaded =
        originalOffers.length > 0 || (pendingOffers !== null && isUpdatePromptOpen);
    const isSingleOfferView =
        processedOffers.length === 1 &&
        hasSearchBeenPerformed &&
        !isWaitingInitialOffers &&
        !isLoadingFromUrl &&
        !isRefiningOffers;


    /**
     * Public API return: grouped state and action handlers for ComparePage.
     */
    return {
        state: {
            mainStatusMessage,
            currentOfferCount: currentOfferCountForDisplay,
            isGloballyLoading,
            isSpecificallyRefining: isRefiningOffers,
            statusMessage: mainStatusMessage,
            isBlockingUi,
            isLoadingFromUrl,
            isWaitingInitialOffers,
            isRefiningOffers,
            isUpdatePromptOpen,

            /* data */
            originalOffers,
            processedOffers,
            pendingOffers,
            recentSearches,
            filters,
            sortOption,
            viewMode,

            /* meta / sharing */
            currentDisplaySlug,
            activeShareableSlug,
            sharedLinkCopied,
            activeFilterCount,

            /* address */
            parsedAddressFromSlug,
            initialAddressLabel,

            /* derived helpers */
            isSearchButtonDisabled,
            isSharePageDisabled,
            hasSearchBeenPerformed,
            areAnyOffersEverLoaded,
            isSingleOfferView,
        },

        actions: {
            handleAddressSelected,
            handleSearchClick,
            handleSharePage,
            handleShareSingleOffer,
            handleShowPendingOffers,
            setIsUpdatePromptOpen /* ui setters */,
            setSortOption,
            setViewMode,
            setFilters,
            resetFilters,
            clearRecentSearches,
        },
    };
}