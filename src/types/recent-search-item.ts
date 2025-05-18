
/**
 * recent-search-item.ts
 *
 * Defines the data structure for a recent search entry in the ComparePage module.
 * Each item represents a previous search or shared link that can be revisited.
 */


/**
 * Represents an entry in the list of recent searches.
 *
 * @property id - Unique identifier for React rendering (e.g., timestamp + random string).
 * @property sessionId - Logical identifier for the search session (address or shared slug).
 * @property url - Shareable path to revisit the comparison page.
 * @property label - Display label for the search (address or shared link description).
 * @property timestamp - Unix timestamp when the search was saved; used for sorting by recency.
 */
export interface RecentSearchItem {
    /**
     * Unique identifier for React rendering (e.g., timestamp + random string).
     */
    id: string;
    /**
     * Logical identifier for the search session (address or shared slug).
     */
    sessionId: string;
    /**
     * Shareable path to revisit the comparison page (e.g., /compare?slug=...).
     */
    url: string;
    /**
     * Display label for the search (address or shared link description).
     */
    label: string;
    /**
     * Unix timestamp when the search was saved; used for sorting by recency.
     */
    timestamp: number;
}