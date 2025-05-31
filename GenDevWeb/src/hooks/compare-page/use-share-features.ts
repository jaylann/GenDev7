"use client";

import { useCallback, useState } from "react";
import { generateShareLink } from "@/utils/generate-share-link";
import { buildUrl } from "@/utils/url";
import { SortOptionKey } from "@/types/sort-option-key";
import { FiltersState } from "@/types/filters-state";
import { DEFAULT_FILTERS } from "@/config/constants";
import { Offer } from "@/types/offer";

type NotifyFunction = (text: string, duration?: number) => void;
type SanitizeFunction = (text: string) => string;

interface UseShareFeaturesProps {
    notifyAction: NotifyFunction;
    sanitizeTextAction: SanitizeFunction;
}

/**
 * Hook for managing sharing functionality
 * @param props - Hook properties
 * @returns Sharing-related state and functions
 */
export function useShareFeatures({
    notifyAction,
    sanitizeTextAction,
}: UseShareFeaturesProps) {
    const [sharedLinkCopied, setSharedLinkCopied] = useState<boolean>(false);

    /**
     * Handles sharing the current page
     */
    const handleSharePage = useCallback(
        async (
            activeShareableSlug: string | null,
            sortOption: SortOptionKey,
            filters: FiltersState,
        ) => {
            if (!activeShareableSlug) {
                notifyAction("Cannot share yet – results are not ready.", 4000);
                return;
            }

            const sharePath = buildUrl(
                activeShareableSlug,
                sortOption,
                filters,
                false,
            );

            if (!sharePath) {
                notifyAction("Cannot share yet – results are not ready.", 4000);
                return;
            }

            try {
                await navigator.clipboard.writeText(
                    `${window.location.origin}${sharePath}`,
                );
                setSharedLinkCopied(true);
                notifyAction("🔗\u00A0Page link copied to clipboard!");
                setTimeout(() => setSharedLinkCopied(false), 2500);
            } catch {
                notifyAction(
                    "Failed to copy page link. Please try manually.",
                    5000,
                );
            }
        },
        [notifyAction],
    );

    /**
     * Handles sharing a single offer
     */
    const handleShareSingleOffer = useCallback(
        async (offer: Offer, activeShareableSlug: string | null) => {
            if (!activeShareableSlug) {
                notifyAction(
                    "Cannot share offer: main list context is missing.",
                    4000,
                );
                return null;
            }

            const offerKey = `${offer.provider}:${offer.product_id}`;
            // Sanitize plan name for display in messages
            const safePlanName = sanitizeTextAction(offer.plan_name);

            // Use toast.promise to show loading/success/error states
            const promise = generateShareLink(activeShareableSlug, offerKey);
            return {
                toastPromise: promise,
                loadingMessage: `Creating link for "${safePlanName}"…`,
                handleSuccess: async ({
                    shared_slug,
                }: {
                    shared_slug: string;
                }) => {
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
                handleError: (e: unknown) =>
                    (e as Error)?.message ??
                    "Could not share offer. Please try again.",
            };
        },
        [notifyAction, sanitizeTextAction],
    );

    return { sharedLinkCopied, handleSharePage, handleShareSingleOffer };
}
