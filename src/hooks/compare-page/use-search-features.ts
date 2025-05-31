"use client";

import { useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { ParsedAddress } from "@/components/compare/address-autocomplete-input";
import { SlugType } from "@/hooks/use-offer-websocket";
import { Offer } from "@/types/offer";
import { SortOptionKey } from "@/types/sort-option-key";
import { FiltersState } from "@/types/filters-state";
import { buildUrl } from "@/utils/url";

/**
 * Options for the debounced router replace function.
 */
interface DebouncedRouterReplaceOptions {
    scroll?: boolean;
    shallow?: boolean;
    locale?: string | false;
}

/**
 * Props for useSearchFeatures hook.
 */
interface UseSearchFeaturesProps {
    setOriginalOffersAction: (offers: Offer[]) => void;
    setPendingOffersAction: (offers: Offer[] | null) => void;
    setCurrentDisplaySlugAction: (slug: string | null) => void;
    setActiveShareableSlugAction: (slug: string | null) => void;
    setIsUpdatePromptOpenAction: (open: boolean) => void;
    setIsLoadingFromUrlAction: (loading: boolean) => void;
    setIsWaitingInitialOffersAction: (waiting: boolean) => void;
    setHasSearchBeenPerformedAction: (performed: boolean) => void;
    setIsRefiningOffersAction: (refining: boolean) => void;
    setMainStatusMessageAction: (message: string) => void;
    setInitialAddressLabelAction: (label: string) => void;
    setParsedBackendAddressAction: (address: ParsedAddress | null) => void;
    addRecentSearchAction: (data: {
        url: string;
        label: string;
        sessionId: string;
    }) => void;
    updateSearchSlugAction: (sessionId: string, newUrl: string) => void;
    connectWebSocketAction: () => void;
    abortCurrentWebSocketAction: () => void;
    debouncedRouterReplaceAction: (
        url: string,
        options?: DebouncedRouterReplaceOptions,
    ) => void;
}

/**
 * Hook for managing search-related functionality
 * @param props - Hook properties
 * @returns Search-related state and functions
 */
export function useSearchFeatures({
    setOriginalOffersAction,
    setPendingOffersAction,
    setCurrentDisplaySlugAction,
    setActiveShareableSlugAction,
    setIsUpdatePromptOpenAction,
    setIsLoadingFromUrlAction,
    setIsWaitingInitialOffersAction,
    setHasSearchBeenPerformedAction,
    setIsRefiningOffersAction,
    setMainStatusMessageAction,
    setInitialAddressLabelAction,
    setParsedBackendAddressAction,
    addRecentSearchAction,
    updateSearchSlugAction,
    connectWebSocketAction,
    abortCurrentWebSocketAction,
    debouncedRouterReplaceAction,
}: UseSearchFeaturesProps) {
    const pathname = usePathname();

    // Reference variables to track search state
    const searchIsActiveRef = useRef<boolean>(false);
    const currentSearchSlugRef = useRef<string | null>(null);
    const initialPageLoadProcessedRef = useRef<boolean>(false);
    const hasAddedInitialHistoryEntryRef = useRef<boolean>(false);
    const sessionIdRef = useRef<string | null>(null);
    const hasTriggeredRefineRef = useRef<boolean>(false);
    const lastSlugTimestampRef = useRef<number>(0);

    /**
     * Handles address selection from autocomplete
     */
    const handleAddressSelected = useCallback(
        (addr: ParsedAddress | null, fullText: string) => {
            setIsLoadingFromUrlAction(false);
            setParsedBackendAddressAction(addr);

            const addressText = addr
                ? `${addr.street} ${addr.house_number}, ${addr.plz} ${addr.city}`
                : fullText.trim();

            setInitialAddressLabelAction(addressText);
            sessionIdRef.current = addressText || null;

            if (addressText) {
                setMainStatusMessageAction(
                    addr
                        ? `Address ready: ${addressText}. Click Search!`
                        : `Could not fully verify "${addressText}". Ensure all parts are clear.`,
                );
            } else {
                setMainStatusMessageAction(
                    "Enter a complete German address to compare internet plans.",
                );
            }
        },
        [
            setIsLoadingFromUrlAction,
            setParsedBackendAddressAction,
            setInitialAddressLabelAction,
            setMainStatusMessageAction,
        ],
    );

    /**
     * Initiates a new search
     */
    const handleSearchClick = useCallback(
        (
            parsedBackendAddress: ParsedAddress | null,
            initialAddressLabel: string,
        ) => {
            abortCurrentWebSocketAction();

            if (!parsedBackendAddress && !initialAddressLabel.trim()) {
                setMainStatusMessageAction(
                    "Please select a valid address first.",
                );
                return;
            }

            initialPageLoadProcessedRef.current = true;
            debouncedRouterReplaceAction(pathname, { scroll: false });
            hasAddedInitialHistoryEntryRef.current = false;
            searchIsActiveRef.current = true;

            sessionIdRef.current = initialAddressLabel.trim();
            currentSearchSlugRef.current = null;

            setOriginalOffersAction([]);
            setPendingOffersAction(null);
            setIsUpdatePromptOpenAction(false);
            setCurrentDisplaySlugAction(null);
            setActiveShareableSlugAction(null);
            setIsLoadingFromUrlAction(false);
            setIsWaitingInitialOffersAction(true);
            setHasSearchBeenPerformedAction(true);

            connectWebSocketAction();
        },
        [
            abortCurrentWebSocketAction,
            debouncedRouterReplaceAction,
            pathname,
            setOriginalOffersAction,
            setPendingOffersAction,
            setIsUpdatePromptOpenAction,
            setCurrentDisplaySlugAction,
            setActiveShareableSlugAction,
            setIsLoadingFromUrlAction,
            setIsWaitingInitialOffersAction,
            setHasSearchBeenPerformedAction,
            setMainStatusMessageAction,
            connectWebSocketAction,
        ],
    );

    /**
     * Handles accepting pending offers
     */
    const handleShowPendingOffers = useCallback(
        (
            pendingOffers: Offer[] | null,
            pendingSlug: string | null,
            currentDisplaySlug: string | null,
            sortOption: SortOptionKey,
            filters: FiltersState,
        ) => {
            if (pendingOffers) {
                setOriginalOffersAction(pendingOffers);

                if (pendingSlug && pendingSlug !== currentDisplaySlug) {
                    setCurrentDisplaySlugAction(pendingSlug);
                    setActiveShareableSlugAction(pendingSlug);

                    const newUrl = buildUrl(
                        pendingSlug,
                        sortOption,
                        filters,
                        false,
                    );
                    if (newUrl) {
                        debouncedRouterReplaceAction(newUrl, { scroll: false });
                        if (sessionIdRef.current) {
                            updateSearchSlugAction(
                                sessionIdRef.current,
                                newUrl,
                            );
                        }
                    }
                }
            }

            setPendingOffersAction(null);
            setIsUpdatePromptOpenAction(false);
            setIsRefiningOffersAction(false);
        },
        [
            setOriginalOffersAction,
            setCurrentDisplaySlugAction,
            setActiveShareableSlugAction,
            setPendingOffersAction,
            setIsUpdatePromptOpenAction,
            setIsRefiningOffersAction,
            debouncedRouterReplaceAction,
            updateSearchSlugAction,
        ],
    );

    /**
     * Handles WebSocket slug received event
     */
    const handleWebSocketSlugReceived = useCallback(
        (
            slug: string | null,
            slugType: SlugType,
            sortOption: SortOptionKey,
            filters: FiltersState,
        ) => {
            if (!searchIsActiveRef.current && slugType !== "SHARED") {
                return;
            }
            if (!slug) return;

            const currentTimestamp = Date.now();
            lastSlugTimestampRef.current = currentTimestamp;
            currentSearchSlugRef.current = slug;
            setActiveShareableSlugAction(slug);
            setCurrentDisplaySlugAction(slug);

            const currentSearchLabel = sessionIdRef.current?.startsWith(
                "shared-",
            )
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
                        addRecentSearchAction({
                            url: urlForHistory,
                            label: currentSearchLabel,
                            sessionId: currentSearchLabel,
                        });
                    } else if (slugType === "FINAL") {
                        updateSearchSlugAction(
                            currentSearchLabel,
                            urlForHistory,
                        );
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

                    if (
                        newTargetUrlPathAndQuery !==
                        currentBrowserUrlPathAndQuery
                    ) {
                        debouncedRouterReplaceAction(newTargetUrlPathAndQuery, {
                            scroll: false,
                        });
                    }
                }
            }
        },
        [
            setActiveShareableSlugAction,
            setCurrentDisplaySlugAction,
            addRecentSearchAction,
            updateSearchSlugAction,
            pathname,
            debouncedRouterReplaceAction,
        ],
    );

    /**
     * Handle WebSocket loading state changes
     */
    const handleWebSocketLoadingChange = useCallback(
        (waiting: boolean) => {
            setIsWaitingInitialOffersAction(waiting);
        },
        [setIsWaitingInitialOffersAction],
    );

    /**
     * Handle pending offers update
     */
    const handlePendingOffersUpdate = useCallback(
        (offers: Offer[] | null) => {
            setPendingOffersAction(offers);
            setIsRefiningOffersAction(false);
        },
        [setPendingOffersAction, setIsRefiningOffersAction],
    );

    /**
     * Handle WebSocket connection errors
     */
    const handleConnectionError = useCallback(
        (msg: string) => {
            setMainStatusMessageAction(msg);
            setIsWaitingInitialOffersAction(false);
            setIsRefiningOffersAction(false);
            searchIsActiveRef.current = false;
        },
        [
            setMainStatusMessageAction,
            setIsWaitingInitialOffersAction,
            setIsRefiningOffersAction,
        ],
    );

    return {
        // Refs
        searchIsActiveRef,
        currentSearchSlugRef,
        initialPageLoadProcessedRef,
        sessionIdRef,
        hasTriggeredRefineRef,

        // Handlers
        handleAddressSelected,
        handleSearchClick,
        handleShowPendingOffers,
        handleWebSocketSlugReceived,
        handleWebSocketLoadingChange,
        handlePendingOffersUpdate,
        handleConnectionError,
    };
}
