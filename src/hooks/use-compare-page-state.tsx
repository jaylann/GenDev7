"use client";

/**
 * Custom React hook that encapsulates all state, side-effects, and business logic
 * for the ComparePage component.
 *
 * Manages WebSocket orchestration, URL synchronization, filter logic,
 * search and share workflows, history, and derived UI flags.
 */
"use client";

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
 * Public API grouping state values and action handlers for the compare page.
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
 * Hook providing ComparePage state and actions.
 *
 * Initializes from URL slug, manages offer fetching and WebSocket updates,
 * handles search, share, and pending-offers workflows, and persists history.
 *
 * @returns ComparePageState - Grouped state and action handlers.
 */
export function useComparePageState(): ComparePageState {
    /**
     * Local state and refs for search lifecycle, offers, and UI flags.
     */
    const searchIsActiveRef = useRef<boolean>(false);
    const currentSearchSlugRef = useRef<string | null>(null);
    const initialPageLoadProcessedRef = useRef<boolean>(false);
    const [hasSearchBeenPerformed, setHasSearchBeenPerformed] = useState<boolean>(false);
    const [originalOffers, setOriginalOffers] = useState<Offer[]>([]);
    const [pendingOffers, setPendingOffers] = useState<Offer[] | null>(null);
    const [parsedBackendAddress, setParsedBackendAddress] = useState<ParsedAddress | null>(null);
    const [parsedAddressFromSlug, setParsedAddressFromSlug] = useState<Address | null>(null);
    const [initialAddressLabel, setInitialAddressLabel] = useState<string>("");
    const [statusMessage, setStatusMessage] = useState<string>("Initializing…");
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
     * Router utilities for navigation and path tracking.
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
     * Offer filters and recent searches management.
     */
    const { filters, setFilters, resetFilters, activeFilterCount } = useOfferFilters(DEFAULT_FILTERS);
    const {
        recentSearches,
        addRecentSearch,
        updateSearchSlug,
        clearRecentSearches,
    } = useRecentSearches();

    /**
     * Memoized values for filter-dependent API provider and fiber flag.
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
     * History and session refs for slug/session tracking and refine state.
     */
    const hasAddedInitialHistoryEntryRef = useRef<boolean>(false);
    const sessionIdRef = useRef<string | null>(null);
    const hasTriggeredRefineRef = useRef<boolean>(false);

    /**
     * Initialize compare page state from URL and shared comparisons.
     */
    useComparePageInitializer({
        setOriginalOffersAction: (offers: Offer[]) => {
            setOriginalOffers(offers);
            if (offers.length > 0 && !initialPageLoadProcessedRef.current) {
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
            setStatusMessage(message);
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
     * Client-side offer processing: sort and filter raw offers.
     */
    const processedOffers = useOfferProcessing(
        originalOffers,
        sortOption,
        filters,
    );

    /**
     * WebSocket management for live offer updates and pending-offers prompts.
     */
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

    /**
     * Effect: keep the latest originalOffers in WebSocket ref for diff detection on updates.
     */
    useEffect(() => {
        updateWebSocketOffersRef(originalOffers);
    }, [originalOffers, updateWebSocketOffersRef]);

    /**
     * Handler: update address state and status based on user input.
     * @param addr - Parsed address object or null.
     * @param fullText - Raw address input string.
     */
    const handleAddressSelected = useCallback(
        (addr: ParsedAddress | null, fullText: string) => {
            setParsedBackendAddress(addr);
            const addressText = addr
                ? `${addr.street} ${addr.house_number}, ${addr.plz} ${addr.city}`
                : fullText.trim();
            if (addressText) {
                sessionIdRef.current = addressText;
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

    /**
     * Handler: validate input, reset state, and start WebSocket search.
     */
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

    /**
     * Handler: replace displayed offers with pending updates when confirmed.
     */
    const handleShowPendingOffers = useCallback(() => {
        if (pendingOffers) {
            setOriginalOffers(pendingOffers);
            setStatusMessage(
                `Displaying updated results (${pendingOffers.length} offers).`,
            );
            // Skip history updates for read-only “shared-…” sessions.
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

    /**
     * Handler: generate and copy shareable link for the full offer list.
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
     * Handler: generate and copy shareable deep link for a single offer.
     * @param offer - Offer to share.
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

    /**
     * Effect: persist recent search history on sort/filter changes.
     */
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

    /**
     * Effect: reset refining state if slug changes.
     */
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

    /**
     * Derived UI flags for disabling controls and view mode.
     */
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

    /**
     * Effect: ensure UI is not stuck in refining when navigating history.
     */
    useEffect(() => {
        if (currentDisplaySlug) {
            setIsRefiningOffers(false);
        }
    }, [currentDisplaySlug, setIsRefiningOffers]);

    /**
     * Public API return: grouped state and action handlers for ComparePage.
     */
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
