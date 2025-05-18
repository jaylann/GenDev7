"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "@/types/address";
import type { Offer } from "@/types/offer";
import { ParsedAddress } from "@/components/compare/address-autocomplete-input";
import { ViewMode } from "@/components/compare/offer-list-controls";
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

/* -------------------------------------------------------------------------- */
/*                                Hook Types                                  */

/* -------------------------------------------------------------------------- */

/**
 * All public values returned by {@link useComparePageState } – neatly grouped
 * into `state` and `actions` to reduce prop-drilling noise in the component
 * tree and keep responsibilities explicit.
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

/* -------------------------------------------------------------------------- */
/*                             useComparePageState                            */

/* -------------------------------------------------------------------------- */

/**
 * Encapsulates **all** side-effects, WebSocket orchestration, URL/slug syncing,
 * filter logic, history management, clipboard interactions & derived booleans
 * for the compare offers page.
 *
 * Keeping the hook colocated with the page means *zero* rendering code is
 * tangled with business logic – ComparePage becomes a clean, declarative view.
 */
export function useComparePageState(): ComparePageState {
    /* ───────────── basic local state ───────────── */
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

    /* ───────────── filters / recent searches ───────────── */
    const { filters, setFilters, resetFilters, activeFilterCount } =
        useOfferFilters(DEFAULT_FILTERS);
    const { recentSearches, addRecentSearch, clearRecentSearches } =
        useRecentSearches();

    /* ───────────── memoised derivations ───────────── */
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

    /* ───────────── history / session id refs ───────────── */
    const hasAddedInitialHistoryEntryRef = useRef<boolean>(false);
    const sessionIdRef = useRef<string | null>(null);

    /* ───────────── initialisation from slug ───────────── */
    useComparePageInitializer({
        setOriginalOffers,
        // now only takes slug
        setSlug: (slug: string | null) => {
            setCurrentDisplaySlug(slug);
            setActiveShareableSlug(slug);
            if (slug) {
                setHasSearchBeenPerformed(true);
                sessionIdRef.current = `shared-${slug}`;
            }
        },
        setSortOption,
        setFilters,
        setStatus: setStatusMessage,
        setLoading: setIsLoadingFromUrl,
        setIsLoadingFromSlug: setIsLoadingFromUrl,
        setParsedAddress: setParsedAddressFromSlug,
        // now label is handled here, separately
        setInitialAddressLabel: (label: string) =>
            setInitialAddressLabel(label),
    });

    /* ───────────── process offers client-side ───────────── */
    const processedOffers = useOfferProcessing(
        originalOffers,
        sortOption,
        filters,
    );

    /* ───────────── WebSocket management ───────────── */
    const handleWebSocketLoadingChange = useCallback((waiting: boolean) => {
        setIsWaitingInitialOffers(waiting);
    }, []);

    const handlePendingOffersUpdate = useCallback((offers: Offer[] | null) => {
        setPendingOffers(offers);
        setIsRefiningOffers(Boolean(offers));
    }, []);

    const handleWebSocketSlugReceived = useCallback(
        (slug: string | null, slugType: SlugType) => {
            if (!slug) return;

            setActiveShareableSlug(slug);
            setCurrentDisplaySlug(slug);

            const currentSearchLabel = sessionIdRef.current?.startsWith(
                "shared-",
            )
                ? null
                : sessionIdRef.current
                  ? sessionIdRef.current
                  : null;

            if (
                currentSearchLabel &&
                !currentSearchLabel.startsWith("shared-")
            ) {
                const url = buildUrl(slug, sortOption, filters, false);
                if (url) {
                    if (
                        slugType === "INITIAL" &&
                        !hasAddedInitialHistoryEntryRef.current
                    ) {
                        hasAddedInitialHistoryEntryRef.current = true;
                        addRecentSearch({
                            url,
                            label: currentSearchLabel,
                            sessionId: currentSearchLabel,
                        });
                    } else if (slugType === "FINAL") {
                        addRecentSearch({
                            url,
                            label: currentSearchLabel,
                            sessionId: currentSearchLabel,
                        });
                    }
                }
            }
        },
        [sortOption, filters, addRecentSearch],
    );

    const { connectWebSocket, updateWebSocketOffersRef } = useOfferWebSocket({
        parsedAddress: parsedBackendAddress,
        hasApiKey: Boolean(GOOGLE_MAPS_API_KEY_FROM_ENV),
        providers: providersForApi,
        wantsFiber,
        onOffersReceived: (offers, phase, willRefine) => {
            setOriginalOffers(offers);
            if (phase === "INITIAL_OFFERS") {
                /* ← honour what the back-end actually promises */
                setIsRefiningOffers(Boolean(willRefine));
            } else if (phase === "FINAL_OFFERS") {
                setIsRefiningOffers(false);
            }
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

    /* keep latest offers inside WebSocket ref for diff detection */
    useEffect(() => {
        updateWebSocketOffersRef(originalOffers);
    }, [originalOffers, updateWebSocketOffersRef]);

    /* ───────────── address selection ───────────── */
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

    /* ───────────── search button ───────────── */
    const handleSearchClick = useCallback(() => {
        if (!sessionIdRef.current && !parsedBackendAddress) {
            setStatusMessage("Please select a valid address first.");
            return;
        }

        hasAddedInitialHistoryEntryRef.current = false;
        const newSessionId = sessionIdRef.current ?? `session-${Date.now()}`;
        sessionIdRef.current = newSessionId;

        setOriginalOffers([]);
        setPendingOffers(null);
        setIsUpdatePromptOpen(false);
        setCurrentDisplaySlug(null);
        setActiveShareableSlug(null);

        setIsLoadingFromUrl(false);
        setIsWaitingInitialOffers(true);
        setIsRefiningOffers(false);
        setHasSearchBeenPerformed(true);

        connectWebSocket();
    }, [parsedBackendAddress, connectWebSocket]);

    /* ───────────── pending offer prompt ───────────── */
    const handleShowPendingOffers = useCallback(() => {
        if (pendingOffers) {
            setOriginalOffers(pendingOffers);
            setStatusMessage(
                `Displaying updated results (${pendingOffers.length} offers).`,
            );

            if (activeShareableSlug && sessionIdRef.current) {
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

    /* ───────────── sharing (page) ───────────── */
    const handleSharePage = useCallback(async () => {
        if (!activeShareableSlug) {
            setStatusMessage("Cannot share yet – results are not ready.");
            return;
        }

        const sharePath = buildUrl(
            activeShareableSlug,
            sortOption,
            filters,
            false,
        );
        if (!sharePath) {
            setStatusMessage("Cannot share page – results are not ready.");
            return;
        }

        try {
            await navigator.clipboard.writeText(
                `${window.location.origin}${sharePath}`,
            );
            setSharedLinkCopied(true);
            setStatusMessage("Page link copied to clipboard!");
            setTimeout(() => setSharedLinkCopied(false), 2500);
        } catch (err) {
            console.error("Clipboard error:", err);
            setStatusMessage("Failed to copy page link. Please try manually.");
        }
    }, [activeShareableSlug, sortOption, filters]);

    /* ───────────── sharing (single offer) ───────────── */
    const handleShareSingleOffer = useCallback(
        async (offer: Offer) => {
            if (!activeShareableSlug) {
                setStatusMessage(
                    "Cannot share offer: main offer list context is missing.",
                );
                return;
            }

            const offerKey = `${offer.provider}:${offer.product_id}`;
            setStatusMessage(`Generating share link for ${offer.plan_name}…`);
            try {
                const { shared_slug } = await generateShareLink(
                    activeShareableSlug,
                    offerKey,
                );
                const url = buildUrl(
                    shared_slug,
                    "recommended",
                    DEFAULT_FILTERS,
                    true,
                );
                if (!url) {
                    setStatusMessage("Failed to construct share URL.");
                    return;
                }
                await navigator.clipboard.writeText(
                    `${window.location.origin}${url}`,
                );
                setStatusMessage(`Link for ${offer.plan_name} copied!`);
            } catch (e: unknown) {
                console.error("Share single offer error", e);
                const errorMessage = e instanceof Error ? e.message : String(e);
                setStatusMessage(
                    errorMessage || "Could not share offer. Please try again.",
                );
            }
        },
        [activeShareableSlug],
    );

    /* ───────────── history for sort / filter changes ───────────── */
    const prevSortRef = useRef<SortOptionKey>(sortOption);
    const prevFiltersRef = useRef<string>(JSON.stringify(filters));

    useEffect(() => {
        if (
            !activeShareableSlug ||
            !sessionIdRef.current ||
            sessionIdRef.current.startsWith("shared-") ||
            isBlockingUi
        )
            return;

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

    /* ───────────── derived helpers ───────────── */
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

    /* ───────────── clear refine when loading a past search ───────────── */
    useEffect(() => {
        // Whenever we jump to a “shared” or previously run search (i.e. slug changes),
        // ensure we’re no longer in the “Refining search…” state.
        if (currentDisplaySlug) {
            setIsRefiningOffers(false);
        }
    }, [currentDisplaySlug, setIsRefiningOffers]);

    /* ───────────── final return ───────────── */
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
