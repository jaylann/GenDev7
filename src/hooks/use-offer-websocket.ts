/**
 * useOfferWebSocket Hook Module
 *
 * Manages the entire WebSocket lifecycle and messaging protocol for offer comparisons.
 * Provides methods to initiate connections, handle incoming messages (INITIAL, FINAL, STATUS, ERROR),
 * and expose convenience functions for updating and cleaning up references.
 * All side-effects are surfaced via callbacks in UseOfferWebSocketProps.
 */
"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ParsedAddress } from "@/components/compare/address-autocomplete-input";
import type { Offer } from "@/types/offer";
import { WEBSOCKET_URL } from "@/config/constants";
import type { WebSocketMessage } from "@/types/web-socket-message";

/**
 * Indicates which URL slug phase originated the payload. The back‑end distinguishes
 * three phases:
 *
 * 1. **INITIAL** – immediately after the fast providers return. May set
 *    {@link WebSocketMessage.will_refine} telling us *whether* to expect another
 *    FINAl payload.
 * 2. **FINAL**   – the complete, deduplicated offer list. Only sent when
 *    `will_refine === true` in the INITIAL payload.
 * 3. **SHARED**  – a slug belonging to a link shared by another user (not used
 *    in the Web‑Socket flow but kept here for completeness).
 */
export type SlugType = "INITIAL" | "FINAL" | "SHARED";

/**
 * Properties and callbacks required for useOfferWebSocket.
 *
 * @property parsedAddress - The selected address to search offers for.
 * @property hasApiKey - Flag indicating if the Maps API key is available.
 * @property providers - List of provider IDs to filter offers by (empty for default).
 * @property wantsFiber - Whether only fiber connection offers should be requested.
 * @property onOffersReceivedAction - Callback when a batch of offers arrives (initial or final).
 * @property onWebSocketSlugReceivedAction - Callback when a slug is received for sharing.
 * @property onLoadingChangeAction - Callback to signal loading state changes.
 * @property onStatusUpdateAction - Callback to update user-visible status messages.
 * @property onConnectionErrorAction - Callback for low-level or protocol errors.
 * @property onPendingOffersUpdateAction - Callback for offers pending confirmation after refinement.
 * @property onPromptOpenChangeAction - Callback to open/close the "new results" prompt.
 * @property initialLoadingState - Whether the hook should suppress loading UI initially (unused within this hook for status messages, but kept for completeness of props).
 */
interface UseOfferWebSocketProps {
    parsedAddress: ParsedAddress | null;
    hasApiKey: boolean;
    /**
     * Provider identifiers selected in the filter popover. If the array is empty we send `undefined`
     * so the back‑end can fall back to its full provider list.
     */
    providers: string[];
    /** Whether the user explicitly wants fibre offers (derived from the Connection‑Type filter). */
    wantsFiber: boolean;
    /**
     * `willRefine` is **exactly** the server value of `will_refine` coming from the
     * INITIAL_OFFERS message. **Do not** derive this from offer counts or heuristics –
     * trust the back‑end.
     */
    onOffersReceivedAction: (
        offers: Offer[],
        phase: "INITIAL_OFFERS" | "FINAL_OFFERS",
        willRefine: boolean,
    ) => void;
    onWebSocketSlugReceivedAction: (slug: string | null, slugType: SlugType) => void;
    onLoadingChangeAction: (waitingForInitial: boolean) => void;
    onStatusUpdateAction: (msg: string) => void;
    onConnectionErrorAction: (msg: string) => void;
    /**
     * Sends us the offers that *will* be shown after the user either confirms the
     * update prompt or we auto‑switch ("quick final") – *only* when `will_refine`
     * was **true** in the INITIAL_OFFERS message.
     */
    onPendingOffersUpdateAction: (offers: Offer[] | null) => void;
    /** Open / close the “New results are in – load them?” modal */
    onPromptOpenChangeAction: (open: boolean) => void;
    /** Whether the page arrived through a slug – disables the initial loading shimmer */
    initialLoadingState: boolean; // Currently unused for status logic, kept for prop integrity
}

/**
 * Hook that encapsulates all WebSocket communication with `/ws/compare`.
 *
 * It is **fully side‑effect‑free** for the outside world except through the
 * callbacks specified in {@link UseOfferWebSocketProps}. All complicated
 * timing / reconnection / refinement logic lives here, keeping the rest of the
 * UI declarative and business‑logic‑free.
 */
export const useOfferWebSocket = (props: UseOfferWebSocketProps) => {
    const generationRef = useRef(0);
    const ws = useRef<WebSocket | null>(null);
    const offersRef = useRef<Offer[]>([]);
    const expectingRefinementRef = useRef<boolean>(false);
    const initialOffersTimestampRef = useRef<number | null>(null);

    const {
        onOffersReceivedAction,
        onWebSocketSlugReceivedAction,
        onLoadingChangeAction,
        onStatusUpdateAction,
        onConnectionErrorAction,
        onPendingOffersUpdateAction,
        onPromptOpenChangeAction,
    } = props;


    /**
     * Closes the current WebSocket connection and resets related state.
     * This function is idempotent and safe to call multiple times.
     */
    const abortCurrentWebSocket = useCallback(() => {
        if (ws.current) {
            ws.current.onopen    = null;
            ws.current.onmessage = null;
            ws.current.onerror   = null;
            ws.current.onclose   = null;
            ws.current.close(1000, "Client aborted connection");
            ws.current = null;
        }
        expectingRefinementRef.current    = false;
        initialOffersTimestampRef.current = null;
    }, []);

    /**
     * Initializes or resets the WebSocket connection for offer searches.
     * Handles address validation and API key checks before connecting.
     * Manages the lifecycle of a single search request.
     */
    const connectWebSocket = useCallback(() => {
        abortCurrentWebSocket();
        generationRef.current += 1;
        const currentGeneration = generationRef.current;

        const { parsedAddress, hasApiKey, providers, wantsFiber } = props;

        if (!hasApiKey) {
            onConnectionErrorAction(
                "Configuration error: Google Maps API key is missing. Search unavailable.",
            );
            return;
        }
        if (!parsedAddress) {
            // This status is typically for user interaction before calling connectWebSocket.
            // If connectWebSocket is called without a parsedAddress, it's an internal logic issue.
            // However, to be safe, we provide a fallback status.
            onStatusUpdateAction("Please select a valid German address to start.");
            onLoadingChangeAction(false); // Ensure loading stops if started prematurely
            return;
        }

        // Reset state for the new connection
        offersRef.current = []; // Clear previous offers for the new search
        onLoadingChangeAction(true);
        onStatusUpdateAction("Connecting to offer service…");
        onWebSocketSlugReceivedAction(null, "INITIAL"); // Reset slug
        onPendingOffersUpdateAction(null);
        onPromptOpenChangeAction(false);

        const socket = new WebSocket(WEBSOCKET_URL);
        ws.current = socket;

        socket.onopen = () => {
            if (currentGeneration !== generationRef.current || socket.readyState !== WebSocket.OPEN) {
                return; // Stale connection or not open
            }
            const payload = {
                ...parsedAddress,
                providers: providers.length ? providers : undefined,
                wants_fiber: wantsFiber,
            };
            socket.send(JSON.stringify(payload));
            // Status will be updated upon receiving INITIAL_OFFERS or other messages.
        };

        socket.onmessage = (event) => {
            if (currentGeneration !== generationRef.current) {
                return; // Stale connection
            }

            let messageData: WebSocketMessage;
            try {
                messageData = JSON.parse(event.data as string);
            } catch (error) {
                console.error("WebSocket: Failed to parse message data", error);
                onConnectionErrorAction("Error: Received malformed data from the server.");
                onLoadingChangeAction(false);
                socket.close(1002, "Protocol error: malformed data");
                return;
            }

            const uniqueOffersMap = new Map<string, Offer>();
            (messageData.offers ?? []).forEach((offer) => {
                uniqueOffersMap.set(`${offer.provider}-${offer.product_id ?? offer.plan_name}`, offer);
            });
            const currentOffers = Array.from(uniqueOffersMap.values());
            const numOffers = currentOffers.length;

            switch (messageData.type) {
                case "INITIAL_OFFERS": {
                    if (messageData.slug) {
                        onWebSocketSlugReceivedAction(messageData.slug, "INITIAL");
                    }
                    const willRefine = Boolean(messageData.will_refine);
                    expectingRefinementRef.current = willRefine;
                    initialOffersTimestampRef.current = Date.now();
                    offersRef.current = currentOffers;

                    onOffersReceivedAction(currentOffers, "INITIAL_OFFERS", willRefine);

                    const serverMsg = messageData.message;
                    if (willRefine) {
                        onStatusUpdateAction(
                            serverMsg ?? `Found ${numOffers} initial offers. Refining for more options…`
                        );
                    } else {
                        onStatusUpdateAction(
                            serverMsg ?? `Search complete. ${numOffers} offers found.`
                        );
                    }
                    // Loading is considered false after initial offers, even if refining,
                    // as the user can interact with the initial set.
                    onLoadingChangeAction(false);
                    break;
                }

                case "FINAL_OFFERS": {
                    const initialTimestamp = initialOffersTimestampRef.current;
                    const previousOffers = offersRef.current;
                    // Auto-load if final offers arrive quickly (e.g., within 5 seconds of initial)
                    const isQuickFinal = !!initialTimestamp && (Date.now() - initialTimestamp <= 5000);

                    expectingRefinementRef.current = false; // No more refinement after FINAL

                    if (messageData.slug) {
                        onWebSocketSlugReceivedAction(messageData.slug, "FINAL");
                    }

                    const serverMsg = messageData.message;

                    if (previousOffers.length === 0 || isQuickFinal) {
                        offersRef.current = currentOffers;
                        onOffersReceivedAction(currentOffers, "FINAL_OFFERS", false);
                        onStatusUpdateAction(
                            serverMsg ?? `Search complete. ${numOffers} offers found.`
                        );
                    } else {
                        // If there were previous offers and it's not a "quick final", check for new offers
                        const hasNewOffers = numOffers > 0 && (numOffers !== previousOffers.length ||
                            currentOffers.some((o, i) => previousOffers[i]?.product_id !== o.product_id)); // Basic diff

                        if (hasNewOffers) {
                            onPendingOffersUpdateAction(currentOffers);
                            onPromptOpenChangeAction(true);
                            onStatusUpdateAction(
                                serverMsg ?? `Update: ${numOffers} refined offers available. Confirm to view.`
                            );
                        } else {
                            // No genuinely new offers, or same offers. Silently finalize.
                            // We still call onOffersReceivedAction to ensure the phase is updated to FINAL_OFFERS.
                            onOffersReceivedAction(currentOffers, "FINAL_OFFERS", false);
                            onStatusUpdateAction(
                                serverMsg ?? `Refinement complete. Displaying ${numOffers} up-to-date offers.`
                            );
                        }
                    }
                    onLoadingChangeAction(false); // Final offers mean loading is definitively complete.
                    initialOffersTimestampRef.current = null; // Reset timestamp
                    break;
                }

                case "STATUS_UPDATE": {
                    // Only show generic server status updates if:
                    // 1. We are NOT in an active refinement phase (where "Refining..." is more relevant).
                    // 2. Or, if no offers have been loaded yet (allowing pre-search status messages).
                    if (!expectingRefinementRef.current || offersRef.current.length === 0) {
                        onStatusUpdateAction(messageData.message ?? "Receiving status update from server…");
                    } else {
                        // Log verbose status updates during refinement for debugging,
                        // but don't show to user to avoid overriding the primary "Refining..." message.
                        console.info("WebSocket STATUS_UPDATE (verbose, during refinement):", messageData.message);
                    }
                    break;
                }

                case "ERROR": {
                    onConnectionErrorAction(messageData.message ?? "An error occurred with the offer service.");
                    onLoadingChangeAction(false);
                    // No need to call abortCurrentWebSocket here, as onclose will handle cleanup.
                    // However, explicitly closing if the server indicates a fatal error can be good.
                    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                        socket.close(1011, "Server error reported"); // 1011: Internal Server Error
                    }
                    break;
                }

                default:
                    // Log unknown message types for debugging, but don't alter user-facing state.
                    console.warn("WebSocket: Received unknown message type:", messageData);
            }
        };

        socket.onerror = (errorEvent) => {
            if (currentGeneration !== generationRef.current) {
                return; // Stale connection
            }
            console.error("WebSocket Error:", errorEvent);
            onConnectionErrorAction("Error: A connection problem occurred with the offer service.");
            onLoadingChangeAction(false);
            // abortCurrentWebSocket() will be called by onclose or next connect attempt.
        };

        socket.onclose = (closeEvent) => {
            if (currentGeneration !== generationRef.current) {
                return; // Stale connection's close event
            }

            // Ignore clean closes initiated by abortCurrentWebSocket (code 1000)
            if (closeEvent.wasClean && closeEvent.code === 1000) {
                return;
            }

            onLoadingChangeAction(false);

            // If the close was unexpected and after some offers were received
            if (!closeEvent.wasClean && offersRef.current.length > 0 && !expectingRefinementRef.current) {
                onStatusUpdateAction("Connection lost. Displaying last known results.");
            } else if (!closeEvent.wasClean && offersRef.current.length === 0) {
                // If connection lost before any offers and not due to a client abort/error already handled
                if (closeEvent.code !== 1011) { // Avoid double error if ERROR message was received
                    onConnectionErrorAction("Error: Connection to offer service lost before results were received.");
                }
            } else if (expectingRefinementRef.current) {
                // If connection lost during refinement
                onStatusUpdateAction("Connection lost during refinement. Displaying initial results.");
                expectingRefinementRef.current = false; // Stop expecting refinement
            }
            // Ensure ws.current is nulled out if this close wasn't from abortCurrentWebSocket
            if (ws.current === socket) {
                ws.current = null;
            }
        };
    }, [
        abortCurrentWebSocket,
        props, // props is a dependency, so all its destructured values are implicitly covered
        // Explicitly list destructured props from `props` object that are used in `connectWebSocket`
        // and its nested handlers if you prefer maximum clarity, though ESLint exhaustive-deps
        // should handle it with `props` as a dependency.
        onOffersReceivedAction,
        onWebSocketSlugReceivedAction,
        onLoadingChangeAction,
        onStatusUpdateAction,
        onConnectionErrorAction,
        onPendingOffersUpdateAction,
        onPromptOpenChangeAction,
    ]);

    /**
     * Effect to clean up the WebSocket connection when the component unmounts
     * or when `abortCurrentWebSocket` identity changes (which it shouldn't, but good practice).
     */
    useEffect(() => {
        return () => {
            generationRef.current +=1; // Invalidate any ongoing operations from previous generations
            abortCurrentWebSocket();
        };
    }, [abortCurrentWebSocket]);

    /**
     * Public API of the hook.
     * - `connectWebSocket`: Initiates a new WebSocket connection and search.
     * - `updateWebSocketOffersRef`: Allows parent component to update the internal reference
     *    of displayed offers, useful for diffing if parent modifies offers post-reception.
     *    (Note: current implementation uses offersRef.current internally, this could be for external sync if needed)
     * - `abortCurrentWebSocket`: Manually aborts the current WebSocket connection.
     */
    return {
        connectWebSocket,
        /**
         * Updates the internal reference of offers. This is crucial if the parent component
         * further processes or filters offers and the WebSocket needs to know the "currently shown"
         * set for comparison against new `FINAL_OFFERS`.
         * @param newOffers - The latest set of offers being displayed by the UI.
         */
        updateWebSocketOffersRef: (newOffers: Offer[]): void => {
            offersRef.current = newOffers;
        },
        abortCurrentWebSocket,
    };
};