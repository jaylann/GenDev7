/** Specifies the type of internet connection. */
import {Offer} from "@/types/offer";

/**
 * Defines the structure of messages received via WebSocket for offer comparison.
 */
export interface WebSocketMessage {
    type: 'INITIAL_OFFERS' | 'FINAL_OFFERS' | 'ERROR' | 'STATUS_UPDATE';
    offers?: Offer[];
    slug?: string;
    message?: string;
    is_complete?: boolean;
}