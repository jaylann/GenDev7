/**
 * Sorting Options Key Definitions
 *
 * Enumerates the possible keys used to sort offer listings
 * in various orders (e.g., by price, speed, duration, or provider).
 * This type drives the behavior of sort controls and API requests.
 */
/**
 * SortOptionKey
 *
 * A union of string literals representing the supported sort orders.
 *
 * Values:
 *  - "recommended": Default sorting based on algorithmic recommendation
 *  - "price_asc": Sort by price in ascending order
 *  - "speed_desc": Sort by download speed in descending order
 *  - "duration_asc": Sort by estimated duration in ascending order
 *  - "provider_asc": Sort by provider name in alphabetical order
 */
export type SortOptionKey =
    | "recommended"
    | "price_asc"
    | "speed_desc"
    | "duration_asc"
    | "provider_asc";
