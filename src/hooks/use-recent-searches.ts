// app/compare/hooks/useRecentSearches.ts
import { useCallback, useEffect, useState } from "react";
import { RecentSearchItem } from "@/types/recent-search-item";

// Maximum number of searches to retain in sessionStorage
const MAX_RECENT_SEARCHES = 5;
// Key under which recent searches are stored in sessionStorage
const STORAGE_KEY = "recentCompareSearches";

// Represents the data required to add or update a recent search entry
interface AddRecentSearchData {
    url: string;
    label: string;
    sessionId: string;
}

/**
 * useRecentSearches hook
 *
 * Manages a list of recent compare page searches:
 * - Loads and validates stored searches from sessionStorage on mount.
 * - Provides functions to add/update and clear searches.
 *
 * @returns {{
 *   recentSearches: RecentSearchItem[];
 *   addRecentSearch: (data: AddRecentSearchData) => void;
 *   clearRecentSearches: () => void;
 * }}
 */
export const useRecentSearches = () => {
    const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(
        [],
    );

    // Initialize recentSearches state from sessionStorage on first render
    useEffect(() => {
        try {
            const storedSearches = sessionStorage.getItem(STORAGE_KEY);
            if (storedSearches) {
                const parsedSearches: RecentSearchItem[] =
                    JSON.parse(storedSearches);
                if (
                    Array.isArray(parsedSearches) &&
                    parsedSearches.every(
                        (item) =>
                            item.id &&
                            item.sessionId &&
                            item.url &&
                            item.label &&
                            item.timestamp,
                    )
                ) {
                    setRecentSearches(
                        parsedSearches.sort(
                            (a, b) => b.timestamp - a.timestamp,
                        ),
                    );
                } else {
                    sessionStorage.removeItem(STORAGE_KEY);
                }
            }
        } catch (error) {
            console.error(
                "Failed to load recent searches from sessionStorage:",
                error,
            );
            sessionStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    /**
     * Adds a new search entry or updates an existing one:
     * - If sessionId exists, update that entry's label, url, and timestamp, moving it to the front.
     * - Otherwise, create a new entry with a unique id and timestamp.
     * - Ensures the list does not exceed MAX_RECENT_SEARCHES entries.
     * - Persists the updated list back to sessionStorage.
     *
     * @param searchData - Object containing url, label, and sessionId for the search
     */
    const addRecentSearch = useCallback((searchData: AddRecentSearchData) => {
        setRecentSearches((prevSearches) => {
            // Duplicate detection: match by *sessionId* OR *url*
            const existingIndex = prevSearches.findIndex(
                (s) =>
                    s.sessionId === searchData.sessionId ||
                    s.url === searchData.url,
            );
            let updatedSearches = [...prevSearches];

            // Prepare updated fields (timestamp always current)
            const newItemData: Omit<RecentSearchItem, "id"> = {
                ...searchData,
                timestamp: Date.now(), // Always update timestamp
            };

            // Update existing entry and move it to the top of the list
            if (existingIndex > -1) {
                // Update existing item: Preserve its original `id` but update other fields.
                const existingItem = updatedSearches[existingIndex];
                updatedSearches[existingIndex] = {
                    ...existingItem,
                    ...newItemData,
                };
                // Move the updated item to the top
                const itemToMove = updatedSearches.splice(existingIndex, 1)[0];
                updatedSearches.unshift(itemToMove);
            } else {
                // Create a new RecentSearchItem and add to the top of the list
                const newItem: RecentSearchItem = {
                    ...newItemData,
                    id:
                        Date.now().toString() +
                        Math.random().toString(36).substring(2, 7), // New unique ID for React
                };
                updatedSearches.unshift(newItem);
            }

            // Trim list to maximum allowed entries
            if (updatedSearches.length > MAX_RECENT_SEARCHES) {
                updatedSearches = updatedSearches.slice(0, MAX_RECENT_SEARCHES);
            }

            // Persist updated list to sessionStorage
            try {
                sessionStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify(updatedSearches),
                );
            } catch (error) {
                console.error(
                    "Failed to save recent searches to sessionStorage:",
                    error,
                );
            }
            return updatedSearches;
        });
    }, []);

    /**
     * Replaces the stored URL for an existing search *without* changing its
     * position, timestamp, label, or id.  No-op if the sessionId is unknown or
     * the URL is already identical.
     *
     * @param sessionId - The stable identifier we generated when the search started
     * @param newUrl    - The final compare-slug URL coming from the WebSocket
     */
    const updateSearchSlug = useCallback(
      (sessionId: string, newUrl: string) => {
        setRecentSearches((prev) => {
          const idx = prev.findIndex((s) => s.sessionId === sessionId);
          if (idx === -1 || prev[idx].url === newUrl) return prev; // nothing to do

          const updated = [...prev];
          updated[idx] = { ...updated[idx], url: newUrl };

          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          } catch (err) {
            console.error("Failed to persist updated recent-search slug:", err);
          }
          return updated;
        });
      },
      [],
    );

    /**
     * Clears all recent search entries from state and sessionStorage.
     */
    const clearRecentSearches = useCallback(() => {
        setRecentSearches([]);
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.error(
                "Failed to clear recent searches from sessionStorage:",
                error,
            );
        }
    }, []);

    // Expose state and handlers to consuming components
    return { recentSearches, addRecentSearch, updateSearchSlug, clearRecentSearches };
};
