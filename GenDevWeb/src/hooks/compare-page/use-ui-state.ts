"use client";

import { useMemo, useState } from "react";
import { Offer } from "@/types/offer";
import { ViewMode } from "@/types/view-mode";
import { isAddressStructurallyValid } from "@/utils/validators";
import { ParsedAddress } from "@/components/compare/address-autocomplete-input";
import { GOOGLE_MAPS_API_KEY_FROM_ENV } from "@/config/constants";

interface UseUiStateProps {
    parsedBackendAddress: ParsedAddress | null;
}

/**
 * Hook for managing UI-related state
 * @param props - Hook properties
 * @returns UI-related state and functions
 */
export function useUiState({ parsedBackendAddress }: UseUiStateProps) {
    // View mode (grid/list)
    const [viewMode, setViewMode] = useState<ViewMode>("grid");

    // Update prompt state
    const [isUpdatePromptOpen, setIsUpdatePromptOpen] =
        useState<boolean>(false);

    // Loading states
    const [isLoadingFromUrl, setIsLoadingFromUrl] = useState<boolean>(true);
    const [isWaitingInitialOffers, setIsWaitingInitialOffers] =
        useState<boolean>(false);
    const [isRefiningOffers, setIsRefiningOffers] = useState<boolean>(false);

    // Status message
    const [mainStatusMessage, setMainStatusMessage] =
        useState<string>("Initializing…");

    // Track if search has been performed
    const [hasSearchBeenPerformed, setHasSearchBeenPerformed] =
        useState<boolean>(false);

    // Computed states
    const isBlockingUi = isLoadingFromUrl || isWaitingInitialOffers;

    // Address validation
    const isAddressValid = useMemo(
        () => isAddressStructurallyValid(parsedBackendAddress),
        [parsedBackendAddress],
    );

    // Search button state
    const isSearchButtonDisabled =
        isBlockingUi || !isAddressValid || !GOOGLE_MAPS_API_KEY_FROM_ENV;

    /**
     * Calculate if share button should be disabled
     */
    const getSharePageDisabledState = (
        activeShareableSlug: string | null,
        isBlockingUi: boolean,
        sharedLinkCopied: boolean,
        originalOffers: Offer[],
        currentDisplaySlug: string | null,
    ): boolean => {
        return (
            !activeShareableSlug ||
            isBlockingUi ||
            sharedLinkCopied ||
            (originalOffers.length === 1 &&
                currentDisplaySlug === activeShareableSlug)
        );
    };

    /**
     * Calculate if any offers have been loaded
     */
    const getAreAnyOffersEverLoaded = (
        originalOffers: Offer[],
        pendingOffers: Offer[] | null,
        isUpdatePromptOpen: boolean,
    ): boolean => {
        return (
            originalOffers.length > 0 ||
            (pendingOffers !== null && isUpdatePromptOpen)
        );
    };

    /**
     * Calculate if view is showing a single offer
     */
    const getIsSingleOfferView = (
        processedOffers: Offer[],
        hasSearchBeenPerformed: boolean,
        isWaitingInitialOffers: boolean,
        isLoadingFromUrl: boolean,
        isRefiningOffers: boolean,
    ): boolean => {
        return (
            processedOffers.length === 1 &&
            hasSearchBeenPerformed &&
            !isWaitingInitialOffers &&
            !isLoadingFromUrl &&
            !isRefiningOffers
        );
    };

    /**
     * Calculate offer count for display purposes
     */
    const getCurrentOfferCount = (
        originalOffers: Offer[],
        hasSearchBeenPerformed: boolean,
        isWaitingInitialOffers: boolean,
        isLoadingFromUrl: boolean,
        isRefiningOffers: boolean,
    ): number | null => {
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
    };

    return {
        // States
        viewMode,
        setViewMode,
        isUpdatePromptOpen,
        setIsUpdatePromptOpen,
        isLoadingFromUrl,
        setIsLoadingFromUrl,
        isWaitingInitialOffers,
        setIsWaitingInitialOffers,
        isRefiningOffers,
        setIsRefiningOffers,
        mainStatusMessage,
        setMainStatusMessage,
        hasSearchBeenPerformed,
        setHasSearchBeenPerformed,

        // Computed
        isBlockingUi,
        isAddressValid,
        isSearchButtonDisabled,

        // Helper functions
        getSharePageDisabledState,
        getAreAnyOffersEverLoaded,
        getIsSingleOfferView,
        getCurrentOfferCount,
    };
}
