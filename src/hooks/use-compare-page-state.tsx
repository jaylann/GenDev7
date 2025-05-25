/**
 * useComparePageState Hook Module
 *
 * Encapsulates all business logic, side-effects, and state management for the ComparePage.
 * Provides a clean separation of concerns by handling WebSocket orchestration, URL syncing,
 * filter logic, history, clipboard interactions, and derived UI flags.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";           /* NEW */
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
 * ComparePageState groups all public state values and action handlers returned by useComparePageState.
 *
 * @property state - Read-only UI state and derived flags.
 * @property actions - Methods to trigger side-effects and update state.
 */
export interface ComparePageState {
    /* ──────────────── state ──────────────── */
    state: {
        /* status / lifecycle */
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
 * Custom React hook for ComparePage.
 *
 * Manages:
 *  - Local and derived state for offers and UI.
 *  - Initialization from URL slug.
 *  - Offer fetching and WebSocket updates.
 *  - Search, share, and pending-offer workflows.
 *  - History and recent-searches management.
 *
 * @returns ComparePageState
 */
export function useComparePageState(): ComparePageState {
    // ───────────── Basic local state hooks ─────────────
    /** Tracks whether the *currently-running* WebSocket search is still relevant */
    const searchIsActiveRef = useRef<boolean>(false);          // ✅ now INSIDE the hook
    // Track search lifecycle, offers data, and UI flags.
    /** Remembers the slug that belongs to the *current* search run. */
    const currentSearchSlugRef = useRef<string | null>(null);
    /**
     * Tracks if the initial page load (which might include a slug) has been processed.
     * This helps distinguish shared link loading from active search slug updates.
     */
    const initialPageLoadProcessedRef = useRef<boolean>(false);

    const [hasSearchBeenPerformed, setHasSearchBeenPerformed] =
        useState<boolean>(false);

    const [originalOffers, setOriginalOffers] = useState<Offer[]>([]);
    const [pendingOffers, setPendingOffers] = useState<Offer[] | null>(null);

    const [parsedBackendAddress, setParsedBackendAddress] =
        useState<ParsedAddress | null>(null);
    const [parsedAddressFromSlug, setParsedAddressFromSlug] =
        useState<Address | null>(null);
    const [initialAddressLabel, setInitialAddressLabel] = useState<string>("");

    const [statusMessage, setStatusMessage] = useState<string>("Initializing…");
    const [currentDisplaySlug, setCurrentDisplaySlug] = useState<string | null>(
        null,
    );
    const [activeShareableSlug, setActiveShareableSlug] = useState<
        string | null
    >(null);

    const [isLoadingFromUrl, setIsLoadingFromUrl] = useState<boolean>(true);
    const [isWaitingInitialOffers, setIsWaitingInitialOffers] =
        useState<boolean>(false);
    const [isRefiningOffers, setIsRefiningOffers] = useState<boolean>(false);
    const isBlockingUi = isLoadingFromUrl || isWaitingInitialOffers;

    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [sortOption, setSortOption] = useState<SortOptionKey>("recommended");
    const [isUpdatePromptOpen, setIsUpdatePromptOpen] =
        useState<boolean>(false);
    const [sharedLinkCopied, setSharedLinkCopied] = useState<boolean>(false);

    /* ───────────── Router helpers ───────────── */
    const router   = useRouter();
    const pathname = usePathname();        // e.g. "/compare"

    // Ephemeral toast notifications for user actions
    const notify = useCallback(
        (text: string, duration = 3000) =>
            sonnerToast(<p className="text-white">{text}</p>, {
                duration,
                id: `toast-${Date.now()}`,
            }),
        [],
    );

    // ───────────── Filters and recent searches hooks ─────────────
    // Manage offer filters and persist recent address searches.
    const { filters, setFilters, resetFilters, activeFilterCount } =
        useOfferFilters(DEFAULT_FILTERS);
    const {
      recentSearches,
      addRecentSearch,
      updateSearchSlug,   // 🆕
      clearRecentSearches,
    } = useRecentSearches();

    // ───────────── Memoized derived values ─────────────
    // Compute expensive derived flags like wantsFiber and API provider list.
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

    // ───────────── History and session identifier refs ─────────────
    // Track URL history integration and session labeling.
    const hasAddedInitialHistoryEntryRef = useRef<boolean>(false);
    const sessionIdRef = useRef<string | null>(null);
    // Ref to track if we've already started a refine for this cycle
    const hasTriggeredRefineRef = useRef<boolean>(false);

    // ───────────── Initialize from URL slug ─────────────
    // Sync page state with URL slug and set up initial search context.
    useComparePageInitializer({
        setOriginalOffersAction: (offers: Offer[]) => {
            setOriginalOffers(offers);
            // If useComparePageInitializer loads offers (i.e., from a slug),
            // mark initial page load as processed regarding slug-derived session ID.
            if (offers.length > 0 && !initialPageLoadProcessedRef.current) {
                 // This implies a slug was present and successfully loaded offers.
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
                // Only set sessionIdRef to 'shared-...' IF this is part of the initial page load
                // processing a slug from the URL, NOT if it's a slug generated from an active search.
                if (!initialPageLoadProcessedRef.current && isLoadingFromUrl) {
                    sessionIdRef.current = `shared-${slug}`;
                }
            }
            // Mark that the initial page load's potential slug has been processed.
            if (!initialPageLoadProcessedRef.current) {
                initialPageLoadProcessedRef.current = true;
            }
        },
        setSortOptionAction: setSortOption,
        setFiltersAction: setFilters,
        setStatusAction: (message: string) => {
            setStatusMessage(message);
            // If status indicates no slug was processed on init, mark initial load processed.
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

    // ───────────── Client-side offer processing ─────────────
    // Sort and filter raw offers using custom hook.
    const processedOffers = useOfferProcessing(
        originalOffers,
        sortOption,
        filters,
    );

    // ───────────── WebSocket management ─────────────
    // Handle connection, incoming offers, status updates, and pending-offer prompts.
    const handleWebSocketLoadingChange = useCallback((waiting: boolean) => {
        setIsWaitingInitialOffers(waiting);
    }, []);

    const handlePendingOffersUpdate = useCallback((offers: Offer[] | null) => {
        setPendingOffers(offers);
    }, []);

    const handleWebSocketSlugReceived = useCallback(
        (slug: string | null, slugType: SlugType) => {
            if (!searchIsActiveRef.current && slugType !== "SHARED") {
                 return;
            }
            if (!slug) {
                return;
            }

            currentSearchSlugRef.current = slug;
            setActiveShareableSlug(slug);
            setCurrentDisplaySlug(slug);

            const currentSearchLabel = sessionIdRef.current?.startsWith("shared-")
                ? null
                : sessionIdRef.current;

            if (currentSearchLabel) {
                const url = buildUrl(slug, sortOption, filters, false);
                if (url) {
                    if (slugType === "INITIAL" && !hasAddedInitialHistoryEntryRef.current) {
                        hasAddedInitialHistoryEntryRef.current = true;
                        addRecentSearch({
                            url,
                            label: currentSearchLabel,
                            sessionId: currentSearchLabel,
                        });
                    } else if (slugType === "FINAL") {
                        updateSearchSlug(currentSearchLabel, url);
                    }
                }
            }

            const isCurrentlyOnComparePage = window.location.pathname === pathname;
            const urlHasNoSlugCurrently = !new URL(window.location.href)
                .searchParams.has("slug");

            if (isCurrentlyOnComparePage && urlHasNoSlugCurrently) {
                const newScopedUrl = buildUrl(slug, sortOption, filters, false);
                if (newScopedUrl) {
                    router.replace(newScopedUrl, { scroll: false });
                }
            }
        },
        [
          sortOption,
          filters,
          addRecentSearch,
          updateSearchSlug,
          router,
          pathname,
        ],
    );

    const { connectWebSocket, updateWebSocketOffersRef, abortCurrentWebSocket } = useOfferWebSocket({
        parsedAddress: parsedBackendAddress,
        hasApiKey: Boolean(GOOGLE_MAPS_API_KEY_FROM_ENV),
        providers: providersForApi,
        wantsFiber,
        onOffersReceivedAction: (offers, phase, willRefine) => {
            setOriginalOffers(offers);

            if (phase === "INITIAL_OFFERS") {
                if (willRefine) {
                    setIsRefiningOffers(true);
                    if (!hasTriggeredRefineRef.current) {
                        sonnerToast(
                            <div>
                                <p className="font-semibold text-white">Refining&nbsp;your&nbsp;search…</p>
                                <p className="text-slate-400">We&#39;re polishing the results while you browse.</p>
                            </div>,
                            { duration: 5_000 },
                        );
                        hasTriggeredRefineRef.current = true;
                    }
                } else {
                    setIsRefiningOffers(false);
                    hasTriggeredRefineRef.current = false;
                    searchIsActiveRef.current = false;
                }
            } else if (phase === "FINAL_OFFERS") {
                setIsRefiningOffers(false);
                hasTriggeredRefineRef.current = false;
                searchIsActiveRef.current = false;
            }
        },
        onWebSocketSlugReceivedAction: handleWebSocketSlugReceived,
        onLoadingChangeAction: handleWebSocketLoadingChange,
        onStatusUpdateAction: setStatusMessage,
        onConnectionErrorAction: (msg) => {
            setStatusMessage(msg);
            setIsWaitingInitialOffers(false);
            setIsRefiningOffers(false);
        },
        onPendingOffersUpdateAction: handlePendingOffersUpdate,
        onPromptOpenChangeAction: setIsUpdatePromptOpen,
        initialLoadingState: isLoadingFromUrl,
    });

    // Keep the latest originalOffers in WebSocket ref for diff detection on updates.
    useEffect(() => {
        updateWebSocketOffersRef(originalOffers);
    }, [originalOffers, updateWebSocketOffersRef]);

    // ───────────── Address selection handler ─────────────
    // Update address state and status message based on user input.
    const handleAddressSelected = useCallback(
        (addr: ParsedAddress | null, fullText: string) => {
            setParsedBackendAddress(addr);

            const addressText = addr
                ? `${addr.street} ${addr.house_number}, ${addr.plz} ${addr.city}`
                : fullText.trim();

            if (addressText) {
                sessionIdRef.current = addressText; // pre-fill session id
                setStatusMessage(
                    addr
                        ? `Address ready: ${addressText}. Click Search!`
                        : `Could not fully verify “${addressText}”. Ensure all parts are clear.`,
                );
            } else {
                sessionIdRef.current = null;
                setStatusMessage(
                    "Enter a complete German address to compare internet plans.",
                );
            }
        },
        [],
    );

    // ───────────── Search button handler ─────────────
    // Validate input, reset state, and initiate WebSocket connection.
    const handleSearchClick = useCallback(() => {
        abortCurrentWebSocket();
        if (!parsedBackendAddress && !sessionIdRef.current) {
            setStatusMessage("Please select a valid address first.");
            return;
        }

        initialPageLoadProcessedRef.current = true;

        router.replace(pathname, { scroll: false });

        hasAddedInitialHistoryEntryRef.current = false;
        searchIsActiveRef.current = true;

        if (!sessionIdRef.current) {
             sessionIdRef.current = `session-${Date.now()}`;
        }
        currentSearchSlugRef.current = null;

        setOriginalOffers([]);
        setPendingOffers(null);
        setIsUpdatePromptOpen(false);
        setCurrentDisplaySlug(null);
        setActiveShareableSlug(null);
        setIsLoadingFromUrl(false);
        setIsWaitingInitialOffers(true);
        setIsRefiningOffers(false);
        setHasSearchBeenPerformed(true);
        hasTriggeredRefineRef.current = false;
        connectWebSocket();
    }, [parsedBackendAddress, connectWebSocket, router, pathname, abortCurrentWebSocket]);

    // ───────────── Pending-offer prompt handler ─────────────
    // Replace the displayed offers with pending updates when confirmed.
    const handleShowPendingOffers = useCallback(() => {
        if (pendingOffers) {
            setOriginalOffers(pendingOffers);
            setStatusMessage(
                `Displaying updated results (${pendingOffers.length} offers).`,
            );

            /**
             * Skip history updates for read-only “shared-…” sessions.
             * (They are already in the list as their original creator’s address.)
             */
            if (
                activeShareableSlug &&
                sessionIdRef.current &&
                !sessionIdRef.current.startsWith("shared-")
            ) {
                const url = buildUrl(
                    activeShareableSlug,
                    sortOption,
                    filters,
                    false,
                );
                if (url)
                    addRecentSearch({
                        url,
                        label: sessionIdRef.current,
                        sessionId: sessionIdRef.current,
                    });
            }
        }
        setPendingOffers(null);
        setIsUpdatePromptOpen(false);
        setIsRefiningOffers(false);
    }, [
        pendingOffers,
        activeShareableSlug,
        sortOption,
        filters,
        addRecentSearch,
    ]);

    // ───────────── Page-sharing handler ─────────────
    // Generate and copy shareable link for the full offer list.
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

    // ───────────── Single-offer sharing handler ─────────────
    // Generate a deep link for an individual offer and copy to clipboard.
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
                            "recommended",
                            DEFAULT_FILTERS,
                            true,
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

    // ───────────── Persist history on sort/filter changes ─────────────
    // Push URL updates to recent searches when UI controls change.
    const prevSortRef = useRef<SortOptionKey>(sortOption);
    const prevFiltersRef = useRef<string>(JSON.stringify(filters));

    useEffect(() => {
        if (
            !activeShareableSlug ||
            !sessionIdRef.current ||
            sessionIdRef.current.startsWith("shared-") ||
            isBlockingUi ||
            searchIsActiveRef.current
        ) {
            return;
        }

        const filtersStr = JSON.stringify(filters);
        const sortChanged = prevSortRef.current !== sortOption;
        const filtersChanged = prevFiltersRef.current !== filtersStr;

        if (sortChanged || filtersChanged) {
            prevSortRef.current = sortOption;
            prevFiltersRef.current = filtersStr;

            const url = buildUrl(
                activeShareableSlug,
                sortOption,
                filters,
                false,
            );
            if (url)
                addRecentSearch({
                    url,
                    label: sessionIdRef.current,
                    sessionId: sessionIdRef.current,
                });
        }
    }, [
        sortOption,
        filters,
        activeShareableSlug,
        isBlockingUi,
        addRecentSearch,
    ]);

    useEffect(() => {
        if (currentDisplaySlug) {
            if (
                currentDisplaySlug !== currentSearchSlugRef.current ||
                !searchIsActiveRef.current
            ) {
                 setIsRefiningOffers(false);
            }
        }
    }, [currentDisplaySlug]);

    // ───────────── Derived UI flags ─────────────
    // Compute disabling flags and view-mode determinations.
    const isSearchButtonDisabled =
        isBlockingUi || !parsedBackendAddress || !GOOGLE_MAPS_API_KEY_FROM_ENV;

    const isSharePageDisabled =
        !activeShareableSlug ||
        isBlockingUi ||
        sharedLinkCopied ||
        (originalOffers.length === 1 &&
            currentDisplaySlug === activeShareableSlug);

    const areAnyOffersEverLoaded =
        originalOffers.length > 0 || pendingOffers !== null;
    const isSingleOfferView =
        originalOffers.length === 1 &&
        hasSearchBeenPerformed &&
        !isWaitingInitialOffers &&
        !isLoadingFromUrl &&
        !isRefiningOffers;

    // ───────────── Reset refining state on slug change ─────────────
    // Ensure the UI is not stuck in “refining” when navigating history.
    useEffect(() => {
        // Whenever we jump to a “shared” or previously run search (i.e. slug changes),
        // ensure we’re no longer in the “Refining search…” state.
        if (currentDisplaySlug) {
            setIsRefiningOffers(false);
        }
    }, [currentDisplaySlug, setIsRefiningOffers]);

    // ───────────── Public API return ─────────────
    // Expose grouped state and action handlers for ComparePage.
    return {
        state: {
            /* status / lifecycle */
            statusMessage,
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
