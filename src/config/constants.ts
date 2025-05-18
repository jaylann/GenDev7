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
    process.env.NEXT_PUBLIC_API_URL?.trim() ?? "http://localhost:8000";
export const WEBSOCKET_URL =
    API_BASE_URL.replace(/^http/i, "ws") + "/ws/compare";
export const GOOGLE_MAPS_API_KEY_FROM_ENV =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

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

export const DEFAULT_FILTERS: FiltersState = {
    contractDurations: [],
    connectionTypes: [],
    minSpeed: 0,
    tvIncluded: "any",
    selectedProviders: [],
    youthOffer: "any",
};

export const AVAILABLE_CONTRACT_DURATIONS = [1, 12, 24];
export const AVAILABLE_CONNECTION_TYPES: ConnectionType[] = [
    "DSL",
    "Cable",
    "Fiber",
    "Mobile",
];
export const MAX_SPEED_FALLBACK = 1000; // Fallback max speed for slider if no offers are loaded

/** Minimum speed for the speed filter slider. */
export const MIN_SPEED_SLIDER_FLOOR: number = 50;

// -----------------------------------------------------------------------------
// Provider list available even before an offer search is executed.
// -----------------------------------------------------------------------------
export const AVAILABLE_PROVIDER_NAMES = [
    "WebWunder",
    "ByteMe",
    "PingPerfect",
    "ServusSpeed",
    "VerbynDich",
] as const;
