"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecentSearchItem } from "@/types/recent-search-item";
import { getCanonicalCompareURL, extractSlug } from "@/utils/url"; // Ensure these are correctly imported

// Maximum number of recent search entries to retain.
const MAX_RECENT_SEARCHES = 5;
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
                console.log(
                    "[useRecentSearches:useEffect] No stored searches found, initializing empty.",
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
                    console.log(
                        "[useRecentSearches:useEffect] Successfully parsed and sorted searches from storage:",
                        sortedSearches,
                    );
                    setRecentSearches(sortedSearches);
                } else {
                    console.warn(
                        "[useRecentSearches:useEffect] Invalid data format in sessionStorage. Resetting. Parsed data:",
                        parsed,
                    );
                    setRecentSearches([]);
                    sessionStorage.removeItem(STORAGE_KEY);
                }
            } catch (err) {
                console.error(
                    "[useRecentSearches:useEffect] Failed to parse recent searches from sessionStorage:",
                    err,
                );
                setRecentSearches([]);
                sessionStorage.removeItem(STORAGE_KEY); // Corrupted data, clear it
            }
        };

        console.log(
            "[useRecentSearches:useEffect] Initializing recent searches from sessionStorage.",
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
                console.log(
                    "[useRecentSearches:useEffect] Storage event detected for key:",
                    STORAGE_KEY,
                );
                parseAndUpdateSearches(event.newValue);
            }
        };

        window.addEventListener("storage", handleStorageChange);
        return () => {
            console.log(
                "[useRecentSearches:useEffect] Cleaning up storage event listener.",
            );
            window.removeEventListener("storage", handleStorageChange);
        };
    }, []);

    /**
     * Adds a new search item to the recent searches list or updates an existing one.
     * @param data - The data for the new search item.
     */
    const addRecentSearch = useCallback((data: AddRecentSearchData) => {
        console.log("[addRecentSearch] Called with data:", data);
        setRecentSearches((prevSearches) => {
            console.log(
                "[addRecentSearch] prevSearches:",
                JSON.parse(
                    JSON.stringify(
                        prevSearches.map((s) => ({
                            sessionId: s.sessionId,
                            url: s.url,
                            label: s.label,
                        })),
                    ),
                ),
            );
            const canonicalUrl = getCanonicalCompareURL(data.url);
            console.log(
                `[addRecentSearch] Canonical URL for "${data.url}" is "${canonicalUrl}"`,
            );

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
                console.log(
                    `[addRecentSearch] Found existing item at index ${existingIndex} (sessionId: ${existingItem.sessionId}, url: ${existingItem.url}). Will update.`,
                );

                const itemToUpdate: RecentSearchItem = {
                    ...existingItem, // Preserves original ID
                    ...newEntryBase, // Overwrites with new data (sessionId, url, label, timestamp)
                };
                updatedSearches = prevSearches.filter(
                    (s, i) => i !== existingIndex,
                );
                updatedSearches.unshift(itemToUpdate);
                console.log(
                    `[addRecentSearch] Updated item (sessionId: ${itemToUpdate.sessionId}, url: ${itemToUpdate.url}, label: "${itemToUpdate.label}"). Moved to top.`,
                );
            } else {
                console.log(
                    `[addRecentSearch] No existing item found for sessionId "${data.sessionId}" or url "${canonicalUrl}". Will add new.`,
                );
                const newItem: RecentSearchItem = {
                    ...newEntryBase,
                    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Generate new ID
                };
                updatedSearches = [newItem, ...prevSearches];
                console.log(
                    `[addRecentSearch] Added new item (sessionId: ${newItem.sessionId}, url: ${newItem.url}, label: "${newItem.label}").`,
                );
            }

            // Limit number of recent searches
            if (updatedSearches.length > MAX_RECENT_SEARCHES) {
                const removedItems = updatedSearches.slice(MAX_RECENT_SEARCHES);
                updatedSearches = updatedSearches.slice(0, MAX_RECENT_SEARCHES);
                console.log(
                    `[addRecentSearch] List exceeded MAX_RECENT_SEARCHES. Trimmed. Removed items:`,
                    removedItems.map((s) => ({
                        sessionId: s.sessionId,
                        label: s.label,
                    })),
                );
            }

            try {
                sessionStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify(updatedSearches),
                );
                console.log(
                    "[addRecentSearch] Successfully persisted updated searches to sessionStorage.",
                );
            } catch (err) {
                console.error(
                    "[addRecentSearch] Failed to persist recent searches to sessionStorage:",
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
                console.warn(
                    "[updateSearchSlug] ABORTED: No sessionId provided. newUrlFromCaller:",
                    newUrlFromCaller,
                );
                return;
            }

            setRecentSearches((prevSearches) => {
                console.groupCollapsed(
                    `[updateSearchSlug] Attempting update for sessionId: "${sessionId}" with newUrlFromCaller: "${newUrlFromCaller}"`,
                );
                console.log(
                    "[updateSearchSlug] Current prevSearches (before update):",
                    JSON.parse(
                        JSON.stringify(
                            prevSearches.map((s) => ({
                                id: s.id,
                                sessionId: s.sessionId,
                                url: s.url,
                                label: s.label,
                                timestamp: s.timestamp,
                            })),
                        ),
                    ),
                );

                const targetIndex = prevSearches.findIndex(
                    (s) => s.sessionId === sessionId,
                );

                if (targetIndex === -1) {
                    console.warn(
                        `[updateSearchSlug] ABORTED: No item found for sessionId "${sessionId}". ` +
                            `Available sessionIds: [${prevSearches.map((s) => s.sessionId).join(", ")}]`,
                    );
                    console.groupEnd();
                    return prevSearches;
                }

                const originalItem = prevSearches[targetIndex];
                const originalSlug = extractSlug(originalItem.url);

                const newCanonicalUrl =
                    getCanonicalCompareURL(newUrlFromCaller);
                const newSlug = extractSlug(newCanonicalUrl);

                console.log(
                    `[updateSearchSlug] Item to update (sessionId "${sessionId}"):`,
                    JSON.parse(JSON.stringify(originalItem)),
                );
                console.log(
                    `[updateSearchSlug] Original details: url="${originalItem.url}", slug="${originalSlug}"`,
                );
                console.log(
                    `[updateSearchSlug] New details from caller: newUrlFromCaller="${newUrlFromCaller}", newCanonicalUrl="${newCanonicalUrl}", newSlug="${newSlug}"`,
                );

                // **CRUCIAL DUPLICATE SLUG CHECK**
                if (newSlug && newSlug !== originalSlug) {
                    const conflictingItem = prevSearches.find(
                        (s) =>
                            s.sessionId !== sessionId &&
                            extractSlug(s.url) === newSlug,
                    );
                    if (conflictingItem) {
                        console.warn(
                            `[updateSearchSlug] DANGER! ABORTING UPDATE for sessionId "${sessionId}". ` +
                                `Attempted to change its slug from "${originalSlug}" (derived from originalItem.url "${originalItem.url}") to "${newSlug}" (derived from newUrlFromCaller "${newUrlFromCaller}"). ` +
                                `However, slug "${newSlug}" is ALREADY IN USE by a DIFFERENT item: sessionId "${conflictingItem.sessionId}", url "${conflictingItem.url}", label "${conflictingItem.label}". ` +
                                `The item for sessionId "${sessionId}" will NOT be updated to prevent data corruption.`,
                        );
                        console.groupEnd();
                        return prevSearches; // PREVENT UPDATE
                    }
                    console.log(
                        `[updateSearchSlug] Slug for sessionId "${sessionId}" will change from "${originalSlug}" to "${newSlug}". No conflict found with other items.`,
                    );
                } else if (newSlug && newSlug === originalSlug) {
                    console.log(
                        `[updateSearchSlug] The new slug "${newSlug}" is the same as the original slug for sessionId "${sessionId}". URL might change due to other params, or only timestamp update needed.`,
                    );
                } else if (!newSlug) {
                    console.log(
                        `[updateSearchSlug] The new URL "${newCanonicalUrl}" does not contain a slug. Original slug was "${originalSlug}". This means the item might lose its slug.`,
                    );
                }

                // If the canonical URL itself hasn't changed, but we still want to bump it (e.g. re-affirm recency)
                if (originalItem.url === newCanonicalUrl) {
                    console.log(
                        `[updateSearchSlug] Canonical URL for sessionId "${sessionId}" ("${newCanonicalUrl}") is identical to original. Will update timestamp and reorder.`,
                    );
                } else {
                    console.log(
                        `[updateSearchSlug] Canonical URL for sessionId "${sessionId}" will change from "${originalItem.url}" to "${newCanonicalUrl}".`,
                    );
                }

                const updatedItem: RecentSearchItem = {
                    ...originalItem, // Retains original ID and label (unless label needs specific update mechanism elsewhere)
                    url: newCanonicalUrl,
                    timestamp: Date.now(),
                };

                console.log(
                    `[updateSearchSlug] Proceeding with update for sessionId "${sessionId}". ` +
                        `Old URL: "${originalItem.url}", New URL: "${updatedItem.url}". ` +
                        `Updated Item:`,
                    JSON.parse(JSON.stringify(updatedItem)),
                );

                // Remove the old version of the item and add the updated version to the front.
                let newUpdatedSearches = prevSearches.filter(
                    (s) => s.sessionId !== sessionId, // Filter out the item being updated
                );
                newUpdatedSearches.unshift(updatedItem); // Add the updated item to the beginning

                // Ensure list doesn't exceed max length - should not happen here as we replace, not add.
                if (newUpdatedSearches.length > MAX_RECENT_SEARCHES) {
                    console.warn(
                        "[updateSearchSlug] List somehow grew beyond MAX_RECENT_SEARCHES during an update. Trimming.",
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
                    console.log(
                        "[updateSearchSlug] Successfully persisted updated searches to sessionStorage.",
                    );
                } catch (err) {
                    console.error(
                        "[updateSearchSlug] Failed to persist updated recent searches to sessionStorage:",
                        err,
                    );
                }
                console.groupEnd();
                return newUpdatedSearches;
            });
        },
        [],
    );

    /**
     * Clears all recent search history from state and sessionStorage.
     */
    const clearRecentSearches = useCallback(() => {
        console.log(
            "[clearRecentSearches] Called. Clearing all recent searches.",
        );
        setRecentSearches([]);
        try {
            sessionStorage.removeItem(STORAGE_KEY);
            console.log(
                "[clearRecentSearches] Successfully removed recent searches from sessionStorage.",
            );
        } catch (err) {
            console.error(
                "[clearRecentSearches] Failed to clear recent searches from sessionStorage:",
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
