/** Specifies the type of internet connection. */
import { Offer } from "@/types/offer";

/**
 * Defines the structure of messages received via WebSocket for offer comparison.
 */
export interface WebSocketMessage {
    /** Type of WebSocket message, indicating the phase or status of offer processing. */
    type: "INITIAL_OFFERS" | "FINAL_OFFERS" | "ERROR" | "STATUS_UPDATE";
    /** Array of Offer objects when the message carries offer data. */
    offers?: Offer[];
    /** Unique slug identifier associated with this batch of offers. */
    slug?: string;
    /** Optional text message for status updates or error details. */
    message?: string;
    /** Flag indicating whether the backend has finished sending offers. */
    is_complete?: boolean;
    /** Indicates if the server will perform additional refinements on the current offers. */
    will_refine?: boolean;
}
