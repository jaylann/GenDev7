"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { buildUrl } from "@/utils/url";
import { SortOptionKey } from "@/types/sort-option-key";
import { FiltersState } from "@/types/filters-state";

type RouterType = ReturnType<typeof useRouter>;
type RouterReplaceOptions = Parameters<RouterType["replace"]>[1];

/**
 * Hook for managing URL synchronization and navigation
 * @returns Functions for URL manipulation and navigation
 */
export function useUrlSynchronization() {
    const router = useRouter();

    // Store debounce state
    const debounceRef = useRef<{
        timeoutId: NodeJS.Timeout | null;
        latestUrl: string | null;
    }>({ timeoutId: null, latestUrl: null });

    /**
     * Debounced version of router.replace to prevent rapid URL updates
     */
    const debouncedRouterReplace = useCallback(
        (url: string, options?: RouterReplaceOptions) => {
            if (debounceRef.current.timeoutId) {
                clearTimeout(debounceRef.current.timeoutId);
            }

            debounceRef.current.latestUrl = url;

            debounceRef.current.timeoutId = setTimeout(() => {
                const currentUrl = debounceRef.current.latestUrl;
                if (currentUrl) {
                    router.replace(currentUrl, options);
                    debounceRef.current.latestUrl = null;
                }
                debounceRef.current.timeoutId = null;
            }, 100); // 100ms debounce time for URL updates
        },
        [router],
    );

    /**
     * Builds a URL with the current compare state and updates the browser URL
     */
    const updateBrowserUrl = useCallback(
        (
            slug: string,
            sortOption: SortOptionKey,
            filters: FiltersState,
            isSingleOffer: boolean = false,
        ) => {
            const newUrl = buildUrl(slug, sortOption, filters, isSingleOffer);

            if (newUrl) {
                const currentBrowserUrlPathAndQuery =
                    window.location.pathname + window.location.search;

                if (newUrl !== currentBrowserUrlPathAndQuery) {
                    debouncedRouterReplace(newUrl, { scroll: false });
                }
            }

            return newUrl;
        },
        [debouncedRouterReplace],
    );

    /**
     * Cleans up any pending timeouts
     */
    const cleanup = useCallback(() => {
        if (debounceRef.current.timeoutId) {
            clearTimeout(debounceRef.current.timeoutId);
        }
    }, []);

    return { debouncedRouterReplace, updateBrowserUrl, cleanup };
}
