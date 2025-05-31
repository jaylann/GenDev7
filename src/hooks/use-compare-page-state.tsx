"use client";

/**
 * @module useComparePageState
 *
 * Provides a custom React hook for managing the ComparePage component's UI state,
 * WebSocket interactions, URL synchronization, filter logic, and sharing workflows.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { Address } from "@/types/address";
import type { Offer } from "@/types/offer";
import { ParsedAddress } from "@/components/compare/address-autocomplete-input";
import { SortOptionKey } from "@/types/sort-option-key";
import { useOfferFilters } from "@/hooks/use-offer-filters";
import {
    AVAILABLE_PROVIDER_NAMES,
    DEFAULT_FILTERS,
    GOOGLE_MAPS_API_KEY_FROM_ENV,
} from "@/config/constants";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { useComparePageInitializer } from "@/hooks/use-compare-page-initializer";
import { useOfferWebSocket } from "@/hooks/use-offer-websocket";
import { useOfferProcessing } from "@/hooks/use-offer-processing";
import { ViewMode } from "@/types/view-mode";
import { logger } from "@/utils/logger";
import { toast as sonnerToast } from "sonner";
import { generateShareLink } from "@/utils/generate-share-link";
import { buildUrl } from "@/utils/url";

import {
    useNotifications,
    useUrlSynchronization,
    useShareFeatures,
    useUiState,
    useSearchFeatures,
} from "@/hooks/compare-page";

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
        handleAddressSelected: (
            addr: ParsedAddress | null,
            rawText: string,
        ) => void;
        handleSearchClick: () => void;
        handleSharePage: () => void;
        handleShareSingleOffer: (offer: Offer, e?: React.MouseEvent) => void;
        handleShowPendingOffers: () => void;
        setIsUpdatePromptOpen: (open: boolean) => void;
        setSortOption: (opt: SortOptionKey) => void;
        setViewMode: (mode: ViewMode) => void;
        setFilters: ReturnType<typeof useOfferFilters>["setFilters"];
        resetFilters: ReturnType<typeof useOfferFilters>["resetFilters"];
        clearRecentSearches: ReturnType<
            typeof useRecentSearches
        >["clearRecentSearches"];
    };
}

export function useComparePageState(): ComparePageState {
    // State for offers
    const [originalOffers, setOriginalOffers] = useState<Offer[]>([]);
    const [pendingOffers, setPendingOffers] = useState<Offer[] | null>(null);
    const [pendingSlug, setPendingSlug] = useState<string | null>(null);

    // State for address
    const [parsedBackendAddress, setParsedBackendAddress] =
        useState<ParsedAddress | null>(null);
    const [parsedAddressFromSlug, setParsedAddressFromSlug] =
        useState<Address | null>(null);
    const [initialAddressLabel, setInitialAddressLabel] = useState<string>("");

    // State for slugs
    const [currentDisplaySlug, setCurrentDisplaySlug] = useState<string | null>(
        null,
    );
    const [activeShareableSlug, setActiveShareableSlug] = useState<
        string | null
    >(null);

    // State for sorting
    const [sortOption, setSortOption] = useState<SortOptionKey>("recommended");

    // Initialize utility hooks
    const { notify, sanitizeText } = useNotifications();
    const {
        debouncedRouterReplace,
        updateBrowserUrl,
        cleanup: cleanupUrlSync,
    } = useUrlSynchronization();
    const { filters, setFilters, resetFilters, activeFilterCount } =
        useOfferFilters(DEFAULT_FILTERS);
    const {
        recentSearches,
        addRecentSearch,
        updateSearchSlug,
        clearRecentSearches,
    } = useRecentSearches();
    const pathname = usePathname();

    // UI state hook
    const uiState = useUiState({ parsedBackendAddress });

    // Share features hook
    const { sharedLinkCopied, handleSharePage: sharePageHandler } =
        useShareFeatures({
            notifyAction: notify,
            sanitizeTextAction: sanitizeText,
        });

    // Computed values for API
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

    // WebSocket integration
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
                (phase === "FINAL_OFFERS" && !uiState.isUpdatePromptOpen)
            ) {
                setOriginalOffers(offers);
            }
            if (phase === "INITIAL_OFFERS") {
                if (willRefine) {
                    uiState.setIsRefiningOffers(true);
                    if (!searchFeatures.hasTriggeredRefineRef.current) {
                        // Safe static string content, no user input/variables used
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
                        searchFeatures.hasTriggeredRefineRef.current = true;
                    }
                } else {
                    uiState.setIsRefiningOffers(false);
                    searchFeatures.hasTriggeredRefineRef.current = false;
                    searchFeatures.searchIsActiveRef.current = false;
                }
            } else if (phase === "FINAL_OFFERS") {
                uiState.setIsRefiningOffers(false);
                searchFeatures.hasTriggeredRefineRef.current = false;
                searchFeatures.searchIsActiveRef.current = false;
            }
        },
        onWebSocketSlugReceivedAction: (slug, slugType) =>
            searchFeatures.handleWebSocketSlugReceived(
                slug,
                slugType,
                sortOption,
                filters,
            ),
        onLoadingChangeAction: (...args) =>
            searchFeatures.handleWebSocketLoadingChange(...args),
        onStatusUpdateAction: uiState.setMainStatusMessage,
        onConnectionErrorAction: (...args) =>
            searchFeatures.handleConnectionError(...args),
        onPendingOffersUpdateAction: (offers, slug) => {
            setPendingOffers(offers);
            setPendingSlug(slug);
            uiState.setIsRefiningOffers(false);
        },
        onPromptOpenChangeAction: uiState.setIsUpdatePromptOpen,
        initialLoadingState: uiState.isLoadingFromUrl,
    });

    // Search features hook
    const searchFeatures = useSearchFeatures({
        setOriginalOffersAction: setOriginalOffers,
        setPendingOffersAction: setPendingOffers,
        setCurrentDisplaySlugAction: setCurrentDisplaySlug,
        setActiveShareableSlugAction: setActiveShareableSlug,
        setIsUpdatePromptOpenAction: uiState.setIsUpdatePromptOpen,
        setIsLoadingFromUrlAction: uiState.setIsLoadingFromUrl,
        setIsWaitingInitialOffersAction: uiState.setIsWaitingInitialOffers,
        setHasSearchBeenPerformedAction: uiState.setHasSearchBeenPerformed,
        setIsRefiningOffersAction: uiState.setIsRefiningOffers,
        setMainStatusMessageAction: uiState.setMainStatusMessage,
        setInitialAddressLabelAction: setInitialAddressLabel,
        setParsedBackendAddressAction: setParsedBackendAddress,
        addRecentSearchAction: addRecentSearch,
        updateSearchSlugAction: updateSearchSlug,
        connectWebSocketAction: connectWebSocket,
        abortCurrentWebSocketAction: abortCurrentWebSocket,
        debouncedRouterReplaceAction: debouncedRouterReplace,
    });

    // Process offers through filters and sorting
    const processedOffers = useOfferProcessing(
        originalOffers,
        sortOption,
        filters,
    );

    // Initialize page state from URL or session
    useComparePageInitializer({
        setOriginalOffersAction: (offers: Offer[]) => {
            setOriginalOffers(offers);
            if (uiState.isLoadingFromUrl) {
                setPendingOffers(null);
                uiState.setIsUpdatePromptOpen(false);
            }
        },
        setSlugAction: (slug: string | null) => {
            const isOtherSlug =
                slug !== searchFeatures.currentSearchSlugRef.current;

            if (
                searchFeatures.searchIsActiveRef.current &&
                slug !== null &&
                isOtherSlug
            ) {
                searchFeatures.searchIsActiveRef.current = false;
                abortCurrentWebSocket();
                uiState.setIsWaitingInitialOffers(false);
                uiState.setIsRefiningOffers(false);
            }
            setCurrentDisplaySlug(slug);
            setActiveShareableSlug(slug); // This becomes the current page's slug
            if (slug) {
                uiState.setHasSearchBeenPerformed(true);
            }
            if (!searchFeatures.initialPageLoadProcessedRef.current) {
                searchFeatures.initialPageLoadProcessedRef.current = true;
            }
        },
        setSortOptionAction: setSortOption,
        setFiltersAction: setFilters,
        setStatusAction: (message: string) => {
            uiState.setMainStatusMessage(message);
            if (
                message.startsWith("Enter an address") &&
                !searchFeatures.initialPageLoadProcessedRef.current
            ) {
                searchFeatures.initialPageLoadProcessedRef.current = true;
            }
        },
        setLoadingAction: uiState.setIsLoadingFromUrl,
        setIsLoadingFromSlugAction: uiState.setIsLoadingFromUrl,
        setParsedAddress: setParsedAddressFromSlug,
        setInitialAddressLabel: (label: string) => {
            setInitialAddressLabel(label); // Update the state for current label
            // Check if the label indicates it's a shared search (derived from slug)
            if (activeShareableSlug && label.startsWith("Shared Search:")) {
                searchFeatures.sessionIdRef.current = `shared-${activeShareableSlug}`; // Or just activeShareableSlug
            } else {
                searchFeatures.sessionIdRef.current = label; // For address-based searches, label is session ID
            }
        },
    });

    // Keep WebSocket updated with latest offers
    useEffect(() => {
        updateWebSocketOffersRef(originalOffers);
        return () => {
            updateWebSocketOffersRef([]);
        };
    }, [originalOffers, updateWebSocketOffersRef]);

    // Handle filter and sort changes
    const prevSortRef = useMemo(() => ({ current: sortOption }), [sortOption]);
    const prevFiltersJsonRef = useMemo(
        () => ({ current: JSON.stringify(filters) }),
        [filters],
    );

    useEffect(() => {
        const currentFiltersJson = JSON.stringify(filters);
        let currentPageSessionId: string | null = null;
        let currentPageLabel: string | null = null;

        if (activeShareableSlug) {
            if (
                initialAddressLabel &&
                !initialAddressLabel.startsWith("Shared Search:")
            ) {
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
            !uiState.isBlockingUi &&
            !searchFeatures.searchIsActiveRef.current &&
            searchFeatures.initialPageLoadProcessedRef.current
        ) {
            const sortChanged = prevSortRef.current !== sortOption;
            const filtersChanged =
                prevFiltersJsonRef.current !== currentFiltersJson;

            if (sortChanged || filtersChanged) {
                logger.info(
                    "ComparePageState",
                    "Sort/filter changed. Updating recent search",
                    {
                        label: currentPageLabel,
                        sessionId: currentPageSessionId,
                        slug: activeShareableSlug,
                    },
                );
                prevSortRef.current = sortOption;
                prevFiltersJsonRef.current = currentFiltersJson;

                const newUrlPathAndQuery = updateBrowserUrl(
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
        uiState.isBlockingUi,
        addRecentSearch,
        pathname,
        initialAddressLabel,
        prevSortRef,
        prevFiltersJsonRef,
        updateBrowserUrl,
    ]);

    // Update refining state when display slug changes
    useEffect(() => {
        if (currentDisplaySlug) {
            if (
                currentDisplaySlug !==
                    searchFeatures.currentSearchSlugRef.current ||
                !searchFeatures.searchIsActiveRef.current
            ) {
                uiState.setIsRefiningOffers(false);
            }
        } else {
            uiState.setIsRefiningOffers(false);
        }
    }, [currentDisplaySlug, uiState, searchFeatures]);

    // Clean up resources on unmount
    useEffect(() => {
        return () => {
            cleanupUrlSync();
        };
    }, [cleanupUrlSync]);

    // Wrap handlers for public API
    const handleAddressSelected = useCallback(
        (addr: ParsedAddress | null, rawText: string) => {
            searchFeatures.handleAddressSelected(addr, rawText);
        },
        [searchFeatures],
    );

    const handleSearchClick = useCallback(() => {
        searchFeatures.handleSearchClick(
            parsedBackendAddress,
            initialAddressLabel,
        );
    }, [searchFeatures, parsedBackendAddress, initialAddressLabel]);

    const handleShowPendingOffers = useCallback(() => {
        searchFeatures.handleShowPendingOffers(
            pendingOffers,
            pendingSlug,
            currentDisplaySlug,
            sortOption,
            filters,
        );
    }, [
        searchFeatures,
        pendingOffers,
        pendingSlug,
        currentDisplaySlug,
        sortOption,
        filters,
    ]);

    const handleSharePage = useCallback(() => {
        return sharePageHandler(activeShareableSlug, sortOption, filters);
    }, [sharePageHandler, activeShareableSlug, sortOption, filters]);

    const handleShareSingleOffer = useCallback(
        (offer: Offer) => {
            logger.debug(
                "useComparePageState",
                `Sharing offer: ${offer.plan_name}, activeSlug: ${activeShareableSlug}`,
                { offer, activeShareableSlug },
            );

            if (!activeShareableSlug) {
                logger.error(
                    "useComparePageState",
                    "Cannot share offer: no active context",
                    { offer },
                );
                notify("Cannot share offer: no active context", 4000);
                return;
            }

            const offerKey = `${offer.provider}:${offer.product_id}`;
            // Sanitize plan name for display in messages
            const safePlanName = sanitizeText(offer.plan_name);

            logger.debug(
                "useComparePageState",
                `Generated offer key: ${offerKey}`,
                { offerKey },
            );

            // Use direct promise pattern instead of the handler pattern
            const sharePromise = generateShareLink(
                activeShareableSlug,
                offerKey,
            );

            sonnerToast.promise(sharePromise, {
                loading: `Creating link for "${safePlanName}"…`,
                success: async ({ shared_slug }: { shared_slug: string }) => {
                    console.log("Shared slug received:", shared_slug);
                    const url = buildUrl(
                        shared_slug,
                        "recommended",
                        DEFAULT_FILTERS,
                        true,
                    );
                    await navigator.clipboard.writeText(
                        `${window.location.origin}${url}`,
                    );
                    return `Link for "${offer.plan_name}" copied!`;
                },
                error: (e) => {
                    logger.error(
                        "useComparePageState",
                        `Share error: ${(e as Error)?.message || e}`,
                        { error: e },
                    );
                    return (
                        (e as Error)?.message ??
                        "Could not share offer. Please try again."
                    );
                },
            });
        },
        [activeShareableSlug, sanitizeText, notify, generateShareLink],
    );

    // Compute derived values
    const currentOfferCountForDisplay = uiState.getCurrentOfferCount(
        originalOffers,
        uiState.hasSearchBeenPerformed,
        uiState.isWaitingInitialOffers,
        uiState.isLoadingFromUrl,
        uiState.isRefiningOffers,
    );

    const isGloballyLoading =
        uiState.isLoadingFromUrl || uiState.isWaitingInitialOffers;

    const isSharePageDisabled = uiState.getSharePageDisabledState(
        activeShareableSlug,
        uiState.isBlockingUi,
        sharedLinkCopied,
        originalOffers,
        currentDisplaySlug,
    );

    const areAnyOffersEverLoaded = uiState.getAreAnyOffersEverLoaded(
        originalOffers,
        pendingOffers,
        uiState.isUpdatePromptOpen,
    );

    const isSingleOfferView = uiState.getIsSingleOfferView(
        processedOffers,
        uiState.hasSearchBeenPerformed,
        uiState.isWaitingInitialOffers,
        uiState.isLoadingFromUrl,
        uiState.isRefiningOffers,
    );

    return {
        state: {
            mainStatusMessage: uiState.mainStatusMessage,
            currentOfferCount: currentOfferCountForDisplay,
            isGloballyLoading,
            isSpecificallyRefining: uiState.isRefiningOffers,
            statusMessage: uiState.mainStatusMessage,
            isBlockingUi: uiState.isBlockingUi,
            isLoadingFromUrl: uiState.isLoadingFromUrl,
            isWaitingInitialOffers: uiState.isWaitingInitialOffers,
            isRefiningOffers: uiState.isRefiningOffers,
            isUpdatePromptOpen: uiState.isUpdatePromptOpen,
            originalOffers,
            processedOffers,
            pendingOffers,
            recentSearches,
            filters,
            sortOption,
            viewMode: uiState.viewMode,
            currentDisplaySlug,
            activeShareableSlug,
            sharedLinkCopied,
            activeFilterCount,
            parsedAddressFromSlug,
            parsedAddressCurrent: parsedBackendAddress,
            initialAddressLabel,
            isAddressValid: uiState.isAddressValid,
            isSearchButtonDisabled: uiState.isSearchButtonDisabled,
            isSharePageDisabled,
            hasSearchBeenPerformed: uiState.hasSearchBeenPerformed,
            areAnyOffersEverLoaded,
            isSingleOfferView,
        },
        actions: {
            handleAddressSelected,
            handleSearchClick,
            handleSharePage,
            handleShareSingleOffer,
            handleShowPendingOffers,
            setIsUpdatePromptOpen: uiState.setIsUpdatePromptOpen,
            setSortOption,
            setViewMode: uiState.setViewMode,
            setFilters,
            resetFilters,
            clearRecentSearches,
        },
    };
}
