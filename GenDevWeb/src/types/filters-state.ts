/**
 * Filters State Module
 *
 * Defines the structure and default handling for user-selected filters
 * in the offer comparison UI.
 */
import { ConnectionType } from "@/types/connection-type";

/**
 * Interface representing the current state of all filter criteria.
 */
export interface FiltersState {
    /** List of contract durations (in months) to filter offers by. */
    contractDurations: number[];
    /** Allowed connection types to include in the filter (e.g., DSL, Fiber). */
    connectionTypes: ConnectionType[];
    /** Minimum internet speed (in Mbps) required for offers. */
    minSpeed: number;
    /** TV inclusion filter: "any" for no preference, "yes" for included, "no" for excluded. */
    tvIncluded: "any" | "yes" | "no";
    /** Identifiers of providers the user has selected to include. */
    selectedProviders: string[];
    /** Youth offer filter: "any" for no preference, "yes" to show only youth plans. */
    youthOffer: "any" | "yes";
}
