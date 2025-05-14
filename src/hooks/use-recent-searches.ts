// app/compare/hooks/useRecentSearches.ts
import { useState, useEffect, useCallback } from 'react';

const MAX_RECENT_SEARCHES = 5;
const STORAGE_KEY = 'recentCompareSearches';

export interface RecentSearchItem {
    id: string;          // Unique ID for React key (e.g., timestamp + random string)
    sessionId: string;   // Identifies the logical search session (e.g., address searched, or slug for shared links)
    url: string;         // The full shareable URL path (e.g., /compare?slug=...)
    label: string;       // User-friendly label (e.g., the address or "Shared: XYZ")
    timestamp: number;   // To sort by recency and for updating
}

interface AddRecentSearchData {
    url: string;
    label: string;
    sessionId: string;
}

/**
 * Custom hook to manage a list of recently visited comparison search URLs.
 * Stores data in sessionStorage.
 * Entries with the same sessionId are updated rather than duplicated.
 * @returns An object with recent searches, add/update function, and clear function.
 */
export const useRecentSearches = () => {
    const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);

    useEffect(() => {
        try {
            const storedSearches = sessionStorage.getItem(STORAGE_KEY);
            if (storedSearches) {
                const parsedSearches: RecentSearchItem[] = JSON.parse(storedSearches);
                if (Array.isArray(parsedSearches) && parsedSearches.every(item => item.id && item.sessionId && item.url && item.label && item.timestamp)) {
                    setRecentSearches(parsedSearches.sort((a, b) => b.timestamp - a.timestamp));
                } else {
                    sessionStorage.removeItem(STORAGE_KEY);
                }
            }
        } catch (error) {
            console.error("Failed to load recent searches from sessionStorage:", error);
            sessionStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    /**
     * Adds a new search or updates an existing one based on sessionId.
     * The updated/added item is moved to the top of the list.
     * @param searchData - The search data including url, label, and sessionId.
     */
    const addRecentSearch = useCallback((searchData: AddRecentSearchData) => {
        setRecentSearches(prevSearches => {
            const existingIndex = prevSearches.findIndex(s => s.sessionId === searchData.sessionId);
            let updatedSearches = [...prevSearches];

            const newItemData: Omit<RecentSearchItem, 'id'> = {
                ...searchData,
                timestamp: Date.now(), // Always update timestamp
            };

            if (existingIndex > -1) {
                // Update existing item: Preserve its original `id` but update other fields.
                const existingItem = updatedSearches[existingIndex];
                updatedSearches[existingIndex] = { ...existingItem, ...newItemData };
                // Move the updated item to the top
                const itemToMove = updatedSearches.splice(existingIndex, 1)[0];
                updatedSearches.unshift(itemToMove);
            } else {
                // Add new item to the beginning
                const newItem: RecentSearchItem = {
                    ...newItemData,
                    id: Date.now().toString() + Math.random().toString(36).substring(2, 7), // New unique ID for React
                };
                updatedSearches.unshift(newItem);
            }

            // Keep only the most recent MAX_RECENT_SEARCHES
            if (updatedSearches.length > MAX_RECENT_SEARCHES) {
                updatedSearches = updatedSearches.slice(0, MAX_RECENT_SEARCHES);
            }

            try {
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSearches));
            } catch (error) {
                console.error("Failed to save recent searches to sessionStorage:", error);
            }
            return updatedSearches;
        });
    }, []);

    const clearRecentSearches = useCallback(() => {
        setRecentSearches([]);
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.error("Failed to clear recent searches from sessionStorage:", error);
        }
    }, []);

    return { recentSearches, addRecentSearch, clearRecentSearches };
};