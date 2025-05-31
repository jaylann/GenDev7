"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecentSearchItem } from "@/types/recent-search-item";
import { getCanonicalCompareURL, extractSlug } from "@/utils/url";
import { MAX_RECENT_SEARCHES } from "@/config/constants"; // Ensure these are correctly imported
import { logger } from "@/utils/logger";

// Key used to persist recent search entries in sessionStorage.
const STORAGE_KEY = "recentCompareSearches";

/**
 * Interface for the data required to add a new recent search.
 */
interface AddRecentSearchData {
    /** The URL associated with the search. This will be canonicalized. */
    url: string;
    /** A user-friendly label for the search. */
    label: string;
    /** A stable session ID for this search, generated when the search initiates. */
    sessionId: string;
}

/**
 * Custom React hook to manage recent search history.
 * This hook handles initializing searches from sessionStorage, adding new searches,
 * updating existing ones (e.g., when a slug resolves or filters change URL), and clearing history.
 * It also synchronizes state across browser tabs via the 'storage' event.
 * Stored URLs are canonicalized to ensure they only contain the slug, ignoring other filters
 * for navigation purposes. Disabling of items in UI is based on slug comparison.
 */
export const useRecentSearches = () => {
    const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(
        [],
    );

    useEffect(() => {
        /**
         * Parses recent searches from a JSON string and updates the state.
         * @param stored - The JSON string from sessionStorage or storage event.
         */
        const parseAndUpdateSearches = (stored: string | null): void => {
            if (!stored) {
                logger.info(
                    "RecentSearches",
                    "No stored searches found, initializing empty.",
                );
                setRecentSearches([]);
                return;
            }
            try {
                const parsed: unknown = JSON.parse(stored);
                // Type guard for validating the structure of each item
                if (
                    Array.isArray(parsed) &&
                    parsed.every(
                        (item): item is RecentSearchItem =>
                            typeof item === "object" &&
                            item !== null &&
                            typeof item.id === "string" &&
                            typeof item.sessionId === "string" &&
                            typeof item.url === "string" &&
                            typeof item.label === "string" &&
                            typeof item.timestamp === "number",
                    )
                ) {
                    const sortedSearches = parsed.sort(
                        (a, b) => b.timestamp - a.timestamp,
                    );
                    logger.info(
                        "RecentSearches",
                        "Successfully parsed and sorted searches from storage",
                        sortedSearches,
                    );
                    setRecentSearches(sortedSearches);
                } else {
                    logger.warn(
                        "RecentSearches",
                        "Invalid data format in sessionStorage. Resetting",
                        parsed,
                    );
                    setRecentSearches([]);
                    sessionStorage.removeItem(STORAGE_KEY);
                }
            } catch (err) {
                logger.error(
                    "RecentSearches",
                    "Failed to parse recent searches from sessionStorage",
                    err,
                );
                setRecentSearches([]);
                sessionStorage.removeItem(STORAGE_KEY); // Corrupted data, clear it
            }
        };

        logger.info(
            "RecentSearches",
            "Initializing recent searches from sessionStorage",
        );
        const stored = sessionStorage.getItem(STORAGE_KEY);
        parseAndUpdateSearches(stored);

        /**
         * Handles storage events to synchronize recent searches across tabs.
         * @param event - The storage event.
         */
        const handleStorageChange = (event: StorageEvent): void => {
            if (
                event.key === STORAGE_KEY &&
                event.storageArea === sessionStorage
            ) {
                logger.info(
                    "RecentSearches",
                    `Storage event detected for key: ${STORAGE_KEY}`,
                );
                parseAndUpdateSearches(event.newValue);
            }
        };

        window.addEventListener("storage", handleStorageChange);
        return () => {
            logger.info("RecentSearches", "Cleaning up storage event listener");
            window.removeEventListener("storage", handleStorageChange);
        };
    }, []);

    /**
     * Adds a new search item to the recent searches list or updates an existing one.
     * @param data - The data for the new search item.
     */
    const addRecentSearch = useCallback((data: AddRecentSearchData) => {
        logger.info("RecentSearches", "Adding new recent search", data);
        setRecentSearches((prevSearches) => {
            const canonicalUrl = getCanonicalCompareURL(data.url);

            // Try to find an existing entry by sessionId or canonical URL
            const existingIndex = prevSearches.findIndex(
                (s) => s.sessionId === data.sessionId || s.url === canonicalUrl,
            );

            let updatedSearches: RecentSearchItem[];
            const newEntryBase: Omit<RecentSearchItem, "id"> = {
                sessionId: data.sessionId,
                url: canonicalUrl, // Use canonical URL
                label: data.label,
                timestamp: Date.now(),
            };

            if (existingIndex > -1) {
                const existingItem = prevSearches[existingIndex];

                const itemToUpdate: RecentSearchItem = {
                    ...existingItem, // Preserves original ID
                    ...newEntryBase, // Overwrites with new data (sessionId, url, label, timestamp)
                };
                updatedSearches = prevSearches.filter(
                    (s, i) => i !== existingIndex,
                );
                updatedSearches.unshift(itemToUpdate);
            } else {
                const newItem: RecentSearchItem = {
                    ...newEntryBase,
                    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Generate new ID
                };
                updatedSearches = [newItem, ...prevSearches];
            }

            // Limit number of recent searches
            if (updatedSearches.length > MAX_RECENT_SEARCHES) {
                updatedSearches = updatedSearches.slice(0, MAX_RECENT_SEARCHES);
            }

            try {
                sessionStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify(updatedSearches),
                );
            } catch (err) {
                logger.error(
                    "RecentSearches",
                    "Failed to persist recent searches to sessionStorage",
                    err,
                );
            }
            return updatedSearches;
        });
    }, []);

    /**
     * Updates the URL of an existing recent search item.
     * @param sessionId - The session ID of the search item to update.
     * @param newUrlFromCaller - The new URL to associate with the search item. This URL will be canonicalized.
     */
    const updateSearchSlug = useCallback(
        (sessionId: string, newUrlFromCaller: string) => {
            if (!sessionId) {
                logger.warn(
                    "RecentSearches",
                    "Update aborted: No sessionId provided",
                    { newUrlFromCaller },
                );
                return;
            }

            setRecentSearches((prevSearches) => {
                logger.info(
                    "RecentSearches",
                    `Attempting update for sessionId: "${sessionId}" with newUrlFromCaller: "${newUrlFromCaller}"`,
                );

                const targetIndex = prevSearches.findIndex(
                    (s) => s.sessionId === sessionId,
                );

                if (targetIndex === -1) {
                    logger.warn(
                        "RecentSearches",
                        `Update aborted: No item found for sessionId "${sessionId}". ` +
                            `Available sessionIds: [${prevSearches.map((s) => s.sessionId).join(", ")}]`,
                    );
                    return prevSearches;
                }

                const originalItem = prevSearches[targetIndex];
                const originalSlug = extractSlug(originalItem.url);

                const newCanonicalUrl =
                    getCanonicalCompareURL(newUrlFromCaller);
                const newSlug = extractSlug(newCanonicalUrl);

                if (newSlug && newSlug !== originalSlug) {
                    const conflictingItem = prevSearches.find(
                        (s) =>
                            s.sessionId !== sessionId &&
                            extractSlug(s.url) === newSlug,
                    );
                    if (conflictingItem) {
                        logger.warn(
                            "RecentSearches",
                            `DANGER! ABORTING UPDATE for sessionId "${sessionId}". ` +
                                `Attempted to change its slug from "${originalSlug}" (derived from originalItem.url "${originalItem.url}") to "${newSlug}" (derived from newUrlFromCaller "${newUrlFromCaller}"). ` +
                                `However, slug "${newSlug}" is ALREADY IN USE by a DIFFERENT item: sessionId "${conflictingItem.sessionId}", url "${conflictingItem.url}", label "${conflictingItem.label}". ` +
                                `The item for sessionId "${sessionId}" will NOT be updated to prevent data corruption.`,
                        );
                        return prevSearches;
                    }
                }

                const updatedItem: RecentSearchItem = {
                    ...originalItem, // Retains original ID and label
                    url: newCanonicalUrl,
                    timestamp: Date.now(),
                };

                // Remove the old version of the item and add the updated version to the front.
                let newUpdatedSearches = prevSearches.filter(
                    (s) => s.sessionId !== sessionId, // Filter out the item being updated
                );
                newUpdatedSearches.unshift(updatedItem); // Add the updated item to the beginning

                // Ensure list doesn't exceed max length - should not happen here as we replace, not add.
                if (newUpdatedSearches.length > MAX_RECENT_SEARCHES) {
                    logger.warn(
                        "RecentSearches",
                        "List somehow grew beyond MAX_RECENT_SEARCHES during an update. Trimming.",
                    );
                    newUpdatedSearches = newUpdatedSearches.slice(
                        0,
                        MAX_RECENT_SEARCHES,
                    );
                }

                try {
                    sessionStorage.setItem(
                        STORAGE_KEY,
                        JSON.stringify(newUpdatedSearches),
                    );
                } catch (err) {
                    logger.error(
                        "RecentSearches",
                        "Failed to persist updated recent searches to sessionStorage",
                        err,
                    );
                }
                return newUpdatedSearches;
            });
        },
        [],
    );

    /**
     * Clears all recent search history from state and sessionStorage.
     */
    const clearRecentSearches = useCallback(() => {
        logger.info("RecentSearches", "Clearing all recent searches");
        setRecentSearches([]);
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (err) {
            logger.error(
                "RecentSearches",
                "Failed to clear recent searches from sessionStorage",
                err,
            );
        }
    }, []);

    return {
        recentSearches,
        addRecentSearch,
        updateSearchSlug,
        clearRecentSearches,
    };
};
