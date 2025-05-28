"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecentSearchItem } from "@/types/recent-search-item";

// Maximum number of recent search entries to retain.
// Key used to persist recent search entries in sessionStorage.
const MAX_RECENT_SEARCHES = 5;
const STORAGE_KEY = "recentCompareSearches";

// Types and helper functions for recent search management.
interface AddRecentSearchData {
    url: string;
    label: string;
    sessionId: string;      // stable ID generated at the moment the search starts
}

/**
 * Extracts the 'slug' query parameter from the provided URL.
 * @param url - The URL string to parse, absolute or relative.
 * @returns The 'slug' parameter value, or null if not present.
 */
const extractSlug = (url: string): string | null => {
    try {
        return new URL(url, window.location.origin).searchParams.get("slug");
    } catch {
        return null;
    }
};

// Custom React hook to manage recent search history.
export const useRecentSearches = () => {
    const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);

    // Initialize recent searches from sessionStorage on mount.
    useEffect(() => {
        try {
            const stored = sessionStorage.getItem(STORAGE_KEY);
            if (!stored) return;

            const parsed: RecentSearchItem[] = JSON.parse(stored);
            if (
                Array.isArray(parsed) &&
                parsed.every(
                    (i) =>
                        i.id && i.sessionId && i.url && i.label && typeof i.timestamp === "number",
                )
            ) {
                setRecentSearches(parsed.toSorted((a, b) => b.timestamp - a.timestamp));
            } else {
                sessionStorage.removeItem(STORAGE_KEY); // corrupted → wipe
            }
        } catch (err) {
            console.error("Failed to read recent searches:", err);
            sessionStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    // Add a new search entry or update an existing one, maintaining recency order.
    const addRecentSearch = useCallback((data: AddRecentSearchData) => {
        setRecentSearches((prev) => {
            const existingIdx = prev.findIndex(
                (s) => s.sessionId === data.sessionId || s.url === data.url,
            );
            const updated = [...prev];
            const base = { ...data, timestamp: Date.now() };

            if (existingIdx > -1) {
                updated[existingIdx] = { ...updated[existingIdx], ...base };
                updated.unshift(updated.splice(existingIdx, 1)[0]); // move to top
            } else {
                updated.unshift({
                    ...base,
                    id: `${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
                });
            }

            if (updated.length > MAX_RECENT_SEARCHES) updated.splice(MAX_RECENT_SEARCHES);

            try {
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            } catch (err) {
                console.error("Failed to persist recent searches:", err);
            }
            return updated;
        });
    }, []);

    // Update the URL of an existing search entry when its final slug is available.
    const updateSearchSlug = useCallback(
        (sessionId: string, newUrl: string) => {
            if (!sessionId) return;                         // nothing to match on

            setRecentSearches((prev) => {
                /* 1️⃣ try sessionId match (normal workflow) */
                let idx = prev.findIndex((s) => s.sessionId === sessionId);

                /* 2️⃣ fallback for shared-link restores that have no sessionId */
                if (idx === -1) {
                    const newSlug = extractSlug(newUrl);
                    idx = prev.findIndex((s) => extractSlug(s.url) === newSlug);
                }

                if (idx === -1 || prev[idx].url === newUrl) return prev; // unchanged

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

    // Clear all stored recent search entries.
    const clearRecentSearches = useCallback(() => {
        setRecentSearches([]);
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (err) {
            console.error("Failed to clear recent searches:", err);
        }
    }, []);

    return { recentSearches, addRecentSearch, updateSearchSlug, clearRecentSearches };
};
