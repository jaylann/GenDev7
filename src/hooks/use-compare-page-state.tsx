"use client";

/**
 * @module useComparePageState
 *
 * Provides a custom React hook for managing the ComparePage component's UI state,
 * WebSocket interactions, URL synchronization, filter logic, and sharing workflows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Address } from "@/types/address";
import type { Offer } from "@/types/offer";
import { ParsedAddress } from "@/components/compare/address-autocomplete-input";
import { isAddressStructurallyValid } from "@/utils/validators";
import { SortOptionKey } from "@/types/sort-option-key";
import { useOfferFilters } from "@/hooks/use-offer-filters";
import {
    AVAILABLE_PROVIDER_NAMES,
    DEFAULT_FILTERS,
    GOOGLE_MAPS_API_KEY_FROM_ENV,
} from "@/config/constants";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { useComparePageInitializer } from "@/hooks/use-compare-page-initializer";
import { SlugType, useOfferWebSocket } from "@/hooks/use-offer-websocket";
import { useOfferProcessing } from "@/hooks/use-offer-processing";
import { buildUrl } from "@/utils/build-url";
import { generateShareLink } from "@/utils/generate-share-link";
import { toast as sonnerToast } from "sonner";
import { ViewMode } from "@/types/view-mode";

// ... (Keep ComparePageState interface as is) ...
export interface ComparePageState {
    state: {
        mainStatusMessage: string;
        currentOfferCount: number | null;
        isGloballyLoading: boolean;
        isSpecificallyRefining: boolean;
        statusMessage: string;
        isBlockingUi: boolean;
        isLoadingFromUrl: boolean;
        isWaitingInitialOffers: boolean;
        isRefiningOffers: boolean;
        isUpdatePromptOpen: boolean;
        originalOffers: Offer[];
        processedOffers: Offer[];
        pendingOffers: Offer[] | null;
        recentSearches: ReturnType<typeof useRecentSearches>["recentSearches"];
        filters: ReturnType<typeof useOfferFilters>["filters"];
        sortOption: SortOptionKey;
        viewMode: ViewMode;
        currentDisplaySlug: string | null;
        activeShareableSlug: string | null;
        sharedLinkCopied: boolean;
        activeFilterCount: number;
        parsedAddressFromSlug: Address | null;
        parsedAddressCurrent: ParsedAddress | null;
        initialAddressLabel: string;
        isAddressValid: boolean;
        isSearchButtonDisabled: boolean;
        isSharePageDisabled: boolean;
        hasSearchBeenPerformed: boolean;
        areAnyOffersEverLoaded: boolean;
        isSingleOfferView: boolean;
    };
    actions: {
        handleAddressSelected: (addr: ParsedAddress | null, rawText: string) => void;
        handleSearchClick: () => void;
        handleSharePage: () => void;
        handleShareSingleOffer: (offer: Offer) => void;
        handleShowPendingOffers: () => void;
        setIsUpdatePromptOpen: (open: boolean) => void;
        setSortOption: (opt: SortOptionKey) => void;
        setViewMode: (mode: ViewMode) => void;
        setFilters: ReturnType<typeof useOfferFilters>["setFilters"];
        resetFilters: ReturnType<typeof useOfferFilters>["resetFilters"];
        clearRecentSearches: ReturnType<typeof useRecentSearches>["clearRecentSearches"];
    };
}

export function useComparePageState(): ComparePageState {
    // ... (Keep most existing useState and useRef declarations as is) ...
    const searchIsActiveRef = useRef<boolean>(false);
    const currentSearchSlugRef = useRef<string | null>(null);
    const initialPageLoadProcessedRef = useRef<boolean>(false);
    const [hasSearchBeenPerformed, setHasSearchBeenPerformed] =
        useState<boolean>(false);
    const [originalOffers, setOriginalOffers] = useState<Offer[]>([]);
    const [pendingOffers, setPendingOffers] = useState<Offer[] | null>(null);
    const [pendingSlug, setPendingSlug] = useState<string | null>(null);
    const [parsedBackendAddress, setParsedBackendAddress] =
        useState<ParsedAddress | null>(null);
    const [parsedAddressFromSlug, setParsedAddressFromSlug] =
        useState<Address | null>(null);
    const [initialAddressLabel, setInitialAddressLabel] = useState<string>(""); // This will be our source of truth for current label
    const [mainStatusMessage, setMainStatusMessage] =
        useState<string>("Initializing…");
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

    const { filters, setFilters, resetFilters, activeFilterCount } =
        useOfferFilters(DEFAULT_FILTERS);
    const {
        recentSearches,
        addRecentSearch,
        updateSearchSlug,
        clearRecentSearches,
    } = useRecentSearches();

    const wantsFiber = useMemo(
        () => filters.connectionTypes.some((ct) => ct.toLowerCase().includes("fiber")),
        [filters.connectionTypes],
    );
    const providersForApi = useMemo(
        () =>
            filters.selectedProviders.length > 0
                ? filters.selectedProviders
                : [...AVAILABLE_PROVIDER_NAMES],
        [filters.selectedProviders],
    );

    const hasAddedInitialHistoryEntryRef = useRef<boolean>(false);
    // sessionIdRef will now be more carefully managed.
    // It should represent the ID of the *active search operation* or the *identifier of the loaded shared link*.
    const sessionIdRef = useRef<string | null>(null);
    const hasTriggeredRefineRef = useRef<boolean>(false);

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
            setActiveShareableSlug(slug); // This becomes the current page's slug
            if (slug) {
                setHasSearchBeenPerformed(true);
                // If this slug is from initial URL load, set sessionIdRef based on it
                // This ensures sessionIdRef is for the *current page context* when loaded from URL
                if (!initialPageLoadProcessedRef.current && isLoadingFromUrl) {
                    // Logic to determine session ID from loaded slug will be inside setInitialAddressLabel
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
            if (
                message.startsWith("Enter an address") &&
                !initialPageLoadProcessedRef.current
            ) {
                initialPageLoadProcessedRef.current = true;
            }
        },
        setLoadingAction: setIsLoadingFromUrl,
        setIsLoadingFromSlugAction: setIsLoadingFromUrl,
        setParsedAddress: setParsedAddressFromSlug,
        setInitialAddressLabel: (label: string) => {
            setInitialAddressLabel(label); // Update the state for current label
            // When initial label is set (especially from URL load), update sessionIdRef
            // This aligns sessionIdRef with the context of the currently loaded page.
            // Check if the label indicates it's a shared search (derived from slug)
            if (activeShareableSlug && label.startsWith("Shared Search:")) {
                sessionIdRef.current = `shared-${activeShareableSlug}`; // Or just activeShareableSlug
            } else {
                sessionIdRef.current = label; // For address-based searches, label is session ID
            }
        },
    });

    const processedOffers = useOfferProcessing(
        originalOffers,
        sortOption,
        filters,
    );
    const handleWebSocketLoadingChange = useCallback((waiting: boolean) => {
        setIsWaitingInitialOffers(waiting);
    }, []);
    const handlePendingOffersUpdate = useCallback(
        (offers: Offer[] | null, slug: string | null) => {
            setPendingOffers(offers);
            setPendingSlug(slug);
            setIsRefiningOffers(false);
        },
        [],
    );
    const lastSlugTimestampRef = useRef<number>(0);

    const handleWebSocketSlugReceived = useCallback(
        (slug: string | null, slugType: SlugType) => {
            if (!searchIsActiveRef.current && slugType !== "SHARED") {
                return;
            }
            if (!slug) return;
            const currentTimestamp = Date.now();
            lastSlugTimestampRef.current = currentTimestamp;
            currentSearchSlugRef.current = slug;
            setActiveShareableSlug(slug);
            setCurrentDisplaySlug(slug);
            const currentSearchLabel = sessionIdRef.current?.startsWith("shared-")
                ? null
                : sessionIdRef.current;
            if (currentSearchLabel) {
                const urlForHistory = buildUrl(
                    slug,
                    sortOption,
                    filters,
                    false,
                );
                if (urlForHistory) {
                    if (
                        slugType === "INITIAL" &&
                        !hasAddedInitialHistoryEntryRef.current
                    ) {
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
            const isCurrentlyOnComparePage =
                window.location.pathname === pathname;
            if (isCurrentlyOnComparePage && searchIsActiveRef.current) {
                const newTargetUrlPathAndQuery = buildUrl(
                    slug,
                    sortOption,
                    filters,
                    false,
                );
                if (newTargetUrlPathAndQuery) {
                    const currentBrowserUrlPathAndQuery =
                        window.location.pathname + window.location.search;
                    const updateTimestamp = lastSlugTimestampRef.current;
                    if (
                        newTargetUrlPathAndQuery !== currentBrowserUrlPathAndQuery
                    ) {
                        setTimeout(() => {
                            if (updateTimestamp === lastSlugTimestampRef.current) {
                                router.replace(newTargetUrlPathAndQuery, {
                                    scroll: false,
                                });
                            }
                        }, 0);
                    }
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

    const {
        connectWebSocket,
        updateWebSocketOffersRef,
        abortCurrentWebSocket,
    } = useOfferWebSocket({
        parsedAddress: parsedBackendAddress,
        hasApiKey: Boolean(GOOGLE_MAPS_API_KEY_FROM_ENV),
        providers: providersForApi,
        wantsFiber,
        onOffersReceivedAction: (offers, phase, willRefine) => {
            if (
                phase === "INITIAL_OFFERS" ||
                (phase === "FINAL_OFFERS" && !isUpdatePromptOpen)
            ) {
                setOriginalOffers(offers);
            }
            if (phase === "INITIAL_OFFERS") {
                if (willRefine) {
                    setIsRefiningOffers(true);
                    if (!hasTriggeredRefineRef.current) {
                        sonnerToast(
                            <div>
                                <p className="font-semibold text-white">
                                    Refining your search…
                                </p>
                                <p className="text-slate-400">
                                    We&#39;re polishing the results while you
                                    browse.
                                </p>
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
        onStatusUpdateAction: setMainStatusMessage,
        onConnectionErrorAction: (msg) => {
            setMainStatusMessage(msg);
            setIsWaitingInitialOffers(false);
            setIsRefiningOffers(false);
            searchIsActiveRef.current = false;
        },
        onPendingOffersUpdateAction: handlePendingOffersUpdate,
        onPromptOpenChangeAction: setIsUpdatePromptOpen,
        initialLoadingState: isLoadingFromUrl,
    });

    useEffect(() => {
        updateWebSocketOffersRef(originalOffers);
        return () => {
            updateWebSocketOffersRef([]);
        };
    }, [originalOffers, updateWebSocketOffersRef]);

    const handleAddressSelected = useCallback(
        (addr: ParsedAddress | null, fullText: string) => {
            if (isLoadingFromUrl) {
                setIsLoadingFromUrl(false);
            }
            setParsedBackendAddress(addr);
            const addressText = addr
                ? `${addr.street} ${addr.house_number}, ${addr.plz} ${addr.city}`
                : fullText.trim();

            setInitialAddressLabel(addressText);
            sessionIdRef.current = addressText || null;

            if (addressText) {
                setMainStatusMessage(
                    addr
                        ? `Address ready: ${addressText}. Click Search!`
                        : `Could not fully verify “${addressText}”. Ensure all parts are clear.`,
                );
            } else {
                setMainStatusMessage(
                    "Enter a complete German address to compare internet plans.",
                );
            }
        },
        [isLoadingFromUrl],
    );

    const handleSearchClick = useCallback(() => {
        abortCurrentWebSocket();
        if (!parsedBackendAddress && !initialAddressLabel.trim()) {
            setMainStatusMessage("Please select a valid address first.");
            return;
        }

        initialPageLoadProcessedRef.current = true;
        router.replace(pathname, { scroll: false });
        hasAddedInitialHistoryEntryRef.current = false;
        searchIsActiveRef.current = true;

        sessionIdRef.current = initialAddressLabel.trim();
        currentSearchSlugRef.current = null;

        setOriginalOffers([]);
        setPendingOffers(null);
        setIsUpdatePromptOpen(false);
        setCurrentDisplaySlug(null);
        setActiveShareableSlug(null);
        setIsLoadingFromUrl(false);
        setIsWaitingInitialOffers(true);
        setHasSearchBeenPerformed(true);

        connectWebSocket();
    }, [
        parsedBackendAddress,
        initialAddressLabel,
        connectWebSocket,
        router,
        pathname,
        abortCurrentWebSocket,
    ]);

    const handleShowPendingOffers = useCallback(() => {
        if (pendingOffers) {
            setOriginalOffers(pendingOffers);
            if (pendingSlug && pendingSlug !== currentDisplaySlug) {
                setCurrentDisplaySlug(pendingSlug);
                setActiveShareableSlug(pendingSlug);

                const newUrl = buildUrl(pendingSlug, sortOption, filters, false);
                if (newUrl) {
                    router.replace(newUrl, { scroll: false });
                    if (sessionIdRef.current) {
                        updateSearchSlug(sessionIdRef.current, newUrl);
                    }
                }
            }
        }
        setPendingOffers(null);
        setPendingSlug(null);
        setIsUpdatePromptOpen(false);
        setIsRefiningOffers(false);
    }, [
        pendingOffers,
        pendingSlug,
        currentDisplaySlug,
        sortOption,
        filters,
        router,
        updateSearchSlug,
    ]);

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
            sonnerToast.promise(
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

    const prevSortRef = useRef<SortOptionKey>(sortOption);
    const prevFiltersJsonRef = useRef<string>(JSON.stringify(filters));

    useEffect(() => {
        const currentFiltersJson = JSON.stringify(filters);
        let currentPageSessionId: string | null = null;
        let currentPageLabel: string | null = null;

        if (activeShareableSlug) {
            if (initialAddressLabel && !initialAddressLabel.startsWith("Shared Search:")) {
                currentPageLabel = initialAddressLabel;
                currentPageSessionId = initialAddressLabel;
            } else {
                currentPageLabel = `Shared Search: ${activeShareableSlug.substring(0, 20)}...`;
                currentPageSessionId = activeShareableSlug;
            }
        }

        if (
            activeShareableSlug &&
            currentPageSessionId &&
            currentPageLabel &&
            !isBlockingUi &&
            !searchIsActiveRef.current &&
            initialPageLoadProcessedRef.current
        ) {
            const sortChanged = prevSortRef.current !== sortOption;
            const filtersChanged =
                prevFiltersJsonRef.current !== currentFiltersJson;

            if (sortChanged || filtersChanged) {
                console.log(
                    "[useComparePageState] Sort/filter changed. Updating recent search. Label:",
                    currentPageLabel,
                    "SessionID:",
                    currentPageSessionId,
                    "Slug:",
                    activeShareableSlug
                );
                prevSortRef.current = sortOption;
                prevFiltersJsonRef.current = currentFiltersJson;

                const newUrlPathAndQuery = buildUrl(
                    activeShareableSlug,
                    sortOption,
                    filters,
                    false,
                );

                if (newUrlPathAndQuery) {
                    addRecentSearch({
                        url: newUrlPathAndQuery,
                        label: currentPageLabel,
                        sessionId: currentPageSessionId,
                    });

                    const currentBrowserUrlPathAndQuery =
                        window.location.pathname + window.location.search;
                    if (newUrlPathAndQuery !== currentBrowserUrlPathAndQuery) {
                        router.replace(newUrlPathAndQuery, { scroll: false });
                    }
                }
            }
        } else {
            prevSortRef.current = sortOption;
            prevFiltersJsonRef.current = currentFiltersJson;
        }
    }, [
        sortOption,
        filters,
        activeShareableSlug,
        isBlockingUi,
        addRecentSearch,
        router,
        pathname,
        initialAddressLabel,
    ]);

    useEffect(() => {
        if (currentDisplaySlug) {
            if (
                currentDisplaySlug !== currentSearchSlugRef.current ||
                !searchIsActiveRef.current
            ) {
                setIsRefiningOffers(false);
            }
        } else {
            setIsRefiningOffers(false);
        }
    }, [currentDisplaySlug]);
    const currentOfferCountForDisplay = useMemo(() => {
        if (originalOffers.length > 0) return originalOffers.length;
        if (
            hasSearchBeenPerformed &&
            !isWaitingInitialOffers &&
            !isLoadingFromUrl &&
            !isRefiningOffers
        ) {
            return 0;
        }
        return null;
    }, [
        originalOffers,
        hasSearchBeenPerformed,
        isWaitingInitialOffers,
        isLoadingFromUrl,
        isRefiningOffers,
    ]);
    const isGloballyLoading = useMemo(() => {
        return isLoadingFromUrl || isWaitingInitialOffers;
    }, [isLoadingFromUrl, isWaitingInitialOffers]);
    const isAddressValid = useMemo(
        () => isAddressStructurallyValid(parsedBackendAddress),
        [parsedBackendAddress],
    );
    const isSearchButtonDisabled =
        isBlockingUi || !isAddressValid || !GOOGLE_MAPS_API_KEY_FROM_ENV;
    const isSharePageDisabled =
        !activeShareableSlug ||
        isBlockingUi ||
        sharedLinkCopied ||
        (originalOffers.length === 1 &&
            currentDisplaySlug === activeShareableSlug);
    const areAnyOffersEverLoaded =
        originalOffers.length > 0 ||
        (pendingOffers !== null && isUpdatePromptOpen);
    const isSingleOfferView =
        processedOffers.length === 1 &&
        hasSearchBeenPerformed &&
        !isWaitingInitialOffers &&
        !isLoadingFromUrl &&
        !isRefiningOffers;

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
            originalOffers,
            processedOffers,
            pendingOffers,
            recentSearches,
            filters,
            sortOption,
            viewMode,
            currentDisplaySlug,
            activeShareableSlug,
            sharedLinkCopied,
            activeFilterCount,
            parsedAddressFromSlug,
            parsedAddressCurrent: parsedBackendAddress,
            initialAddressLabel,
            isAddressValid,
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
            setIsUpdatePromptOpen,
            setSortOption,
            setViewMode,
            setFilters,
            resetFilters,
            clearRecentSearches,
        },
    };
}
