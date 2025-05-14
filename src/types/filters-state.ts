import {ConnectionType} from "@/types/connection-type";

/**
 * Defines the structure for filter values.
 */
export interface FiltersState {
    contractDurations: number[];
    connectionTypes: ConnectionType[];
    minSpeed: number;
    tvIncluded: 'any' | 'yes' | 'no';
    selectedProviders: string[];
    youthOffer: 'any' | 'yes';
}