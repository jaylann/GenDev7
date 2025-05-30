/**
 * Constants Module
 *
 * Defines application-wide constants for API endpoints, sorting options,
 * filter defaults, and available choices for contract durations, connection types,
 * and provider names.
 */
import {
    Building2,
    CalendarClock,
    Gauge,
    Star,
    TrendingUp,
} from "lucide-react";
import { FiltersState } from "@/types/filters-state";
import { ConnectionType } from "@/types/connection-type";
import { SortOption } from "@/types/sort-option";

export const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * WebSocket endpoint for real-time comparison updates.
 * Derived from API_BASE_URL by replacing http(s) with ws(s).
 */
export const WEBSOCKET_URL = (() => {
    const wsProtocol = API_BASE_URL.startsWith("https") ? "wss" : "ws";
    const host = API_BASE_URL.split("://")[1];
    return `${wsProtocol}://${host}/ws/compare`;
})();

/**
 * Google Maps API key loaded from environment.
 * Used for address autocomplete and map rendering.
 */
export const GOOGLE_MAPS_API_KEY_FROM_ENV =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

/**
 * Array of available sort options for offers.
 * Each option includes a unique key, a user-facing label, and an icon component.
 */
export const SORT_OPTIONS: SortOption[] = [
    { key: "recommended", label: "Recommended", icon: Star },
    { key: "price_asc", label: "Price (Lowest First)", icon: TrendingUp },
    { key: "speed_desc", label: "Speed (Fastest Download)", icon: Gauge },
    {
        key: "duration_asc",
        label: "Contract (Shortest First)",
        icon: CalendarClock,
    },
    { key: "provider_asc", label: "Provider Name (A-Z)", icon: Building2 },
];

/**
 * Default state for all offer filters.
 * Defines initial values before the user applies any filters.
 */
export const DEFAULT_FILTERS: FiltersState = {
    contractDurations: [],
    connectionTypes: [],
    minSpeed: 0,
    tvIncluded: "any",
    selectedProviders: [],
    youthOffer: "any",
};

/**
 * Supported contract durations in months.
 * Displayed as filter options in the UI.
 */
export const AVAILABLE_CONTRACT_DURATIONS = [1, 12, 24, 36];
/**
 * Supported connection types for filtering.
 * Must match keys expected by the backend.
 */
export const AVAILABLE_CONNECTION_TYPES: ConnectionType[] = [
    "DSL",
    "Cable",
    "Fiber",
    "Mobile",
];
/**
 * Fallback maximum speed (in Mbps) for the speed filter slider
 * when no offers are loaded to determine the true maximum.
 */
export const MAX_SPEED_FALLBACK = 1000; // Fallback max speed for slider if no offers are loaded

/**
 * Minimum speed (in Mbps) allowed by the speed filter slider.
 * Prevents setting the filter below a reasonable threshold.
 */
export const MIN_SPEED_SLIDER_FLOOR: number = 10;

/**
 * List of provider names available before any search.
 * Used to populate the provider filter dropdown immediately on load.
 */
export const AVAILABLE_PROVIDER_NAMES = [
    "WebWunder",
    "ByteMe",
    "PingPerfect",
    "ServusSpeed",
    "VerbynDich",
] as const;

// Maximum number of recent search entries to retain.
export const MAX_RECENT_SEARCHES = 5;
