"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ParsedAddress } from "@/components/compare/address-autocomplete-input";
import type { Offer } from "@/types/offer";
import { WEBSOCKET_URL } from "@/config/constants";
import type { WebSocketMessage } from "@/types/web-socket-message";

/* Type Definitions */
export type SlugType = "INITIAL" | "FINAL" | "SHARED";

interface UseOfferWebSocketProps {
    parsedAddress: ParsedAddress | null;
    hasApiKey: boolean;
    providers: string[];
    wantsFiber: boolean;

    onOffersReceivedAction: (
        offers: Offer[],
        phase: "INITIAL_OFFERS" | "FINAL_OFFERS",
        willRefine: boolean,
    ) => void;
    onWebSocketSlugReceivedAction: (slug: string | null, t: SlugType) => void;
    onLoadingChangeAction: (waiting: boolean) => void;
    onStatusUpdateAction: (msg: string) => void;
    onConnectionErrorAction: (msg: string) => void;

    /** Handler invoked when pending offers and slug are available for review */
    onPendingOffersUpdateAction: (offers: Offer[] | null, slug: string | null) => void;
    onPromptOpenChangeAction: (open: boolean) => void;

    initialLoadingState: boolean;
}

/* Custom React Hook: useOfferWebSocket */
export const useOfferWebSocket = (props: UseOfferWebSocketProps) => {
    const genRef             = useRef(0);
    const wsRef              = useRef<WebSocket | null>(null);
    const firstBatchTsRef    = useRef<number | null>(null);
    const offersRef          = useRef<Offer[]>([]);

    // Closes the active WebSocket connection and resets related state
    const abortCurrentWebSocket = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.onopen =
                wsRef.current.onmessage =
                    wsRef.current.onerror =
                        wsRef.current.onclose = null;
            wsRef.current.close(1000, "Aborted by navigation/search");
        }
        wsRef.current        = null;
        firstBatchTsRef.current = null;
    }, []);

    // Updates internal offers reference for consistent data across components
    const updateWebSocketOffersRef = useCallback((offers: Offer[]) => {
        offersRef.current = offers;
    }, []);

    // Establishes or re-establishes the WebSocket connection
    const connectWebSocket = useCallback(() => {
        abortCurrentWebSocket();
        genRef.current += 1;
        const gen = genRef.current;

        const {
            parsedAddress,
            hasApiKey,
            providers,
            wantsFiber,
            onOffersReceivedAction,
            onWebSocketSlugReceivedAction,
            onLoadingChangeAction,
            onStatusUpdateAction,
            onConnectionErrorAction,
            onPendingOffersUpdateAction,
            onPromptOpenChangeAction,
        } = props;

        // Validation checks for API key presence and selected address
        if (!hasApiKey) {
            onConnectionErrorAction("Google Maps API key missing – cannot run search.");
            return;
        }
        if (!parsedAddress) {
            onStatusUpdateAction("Please select a valid German address first.");
            return;
        }

        // Initialize UI loading state and reset slug indicator
        onLoadingChangeAction(true);
        onWebSocketSlugReceivedAction(null, "INITIAL");

        // Create and configure the WebSocket instance
        const sock = new WebSocket(WEBSOCKET_URL);
        wsRef.current = sock;

        sock.onopen = () => {
            if (gen !== genRef.current) return;
            sock.send(
                JSON.stringify({
                    ...parsedAddress,
                    providers: providers.length ? providers : undefined,
                    wants_fiber: wantsFiber,
                }),
            );
        };

        sock.onmessage = (ev) => {
            if (gen !== genRef.current) return;

            let data: WebSocketMessage;
            try {
                data = JSON.parse(ev.data as string);
            } catch {
                onConnectionErrorAction("Malformed data from server.");
                onLoadingChangeAction(false);
                return;
            }

            // Remove duplicate offers based on provider and plan identifiers
            const seen = new Set<string>();
            const offers: Offer[] = [];
            (data.offers ?? []).forEach((o) => {
                const k = `${o.provider}-${o.product_id ?? o.plan_name}`;
                if (!seen.has(k)) {
                    offers.push(o);
                    seen.add(k);
                }
            });

            switch (data.type) {
                // Handle initial offers from the server
                case "INITIAL_OFFERS": {
                    const willRefine = Boolean(data.will_refine);
                    firstBatchTsRef.current = Date.now();
                    offersRef.current = offers;

                    if (data.slug) onWebSocketSlugReceivedAction(data.slug, "INITIAL");

                    onOffersReceivedAction(offers, "INITIAL_OFFERS", willRefine);
                    if (data.message) {

                        onStatusUpdateAction(
                            data.message
                        );
                    }
                    onLoadingChangeAction(false);
                    break;
                }

                // Handle final offers refinement from the server
                case "FINAL_OFFERS": {
                    const quick =
                        !!firstBatchTsRef.current &&
                        Date.now() - firstBatchTsRef.current <= 5_000;

                    if (quick) {
                        // Fast refinement: update offers immediately without prompting user
                        if (data.slug) onWebSocketSlugReceivedAction(data.slug, "FINAL");

                        offersRef.current = offers;
                        onOffersReceivedAction(offers, "FINAL_OFFERS", false);
                        if (data.message) {
                            onStatusUpdateAction(
                                data.message
                            );
                        }
                    } else {
                        // Slow refinement: stage pending offers and prompt user for review

                        // 1. Store pending offers and slug for later use
                        onPendingOffersUpdateAction(offers, data.slug ?? null);

                        // 2. Trigger display of the "new results" dialog
                        onPromptOpenChangeAction(true);

                        // 3. Stop loading indicator without altering the displayed offers
                        onOffersReceivedAction(offersRef.current, "FINAL_OFFERS", false);
                        if (data.message) {
                            onStatusUpdateAction(
                                data.message
                            );
                        }
                    }

                    onLoadingChangeAction(false);
                    firstBatchTsRef.current = null;
                    break;
                }


                // Handle status update messages
                case "STATUS_UPDATE":
                    if (data.message?.trim()) onStatusUpdateAction(data.message);
                    break;

                // Handle error messages from the server
                case "ERROR":
                    onConnectionErrorAction(data.message ?? "WebSocket connection error.");
                    onLoadingChangeAction(false);
                    break;

                default:
                    console.warn("Unknown WebSocket message:", data);
            }
        };

        sock.onerror = () => {
            if (gen !== genRef.current) return;
            onConnectionErrorAction("A low-level WebSocket error occurred.");
            onLoadingChangeAction(false);
        };

        sock.onclose = (ev) => {
            if (gen !== genRef.current) return;
            if (ev.wasClean || ev.code === 1000) return;     // expected
            onStatusUpdateAction("Connection lost. Displaying last known results.");
            onLoadingChangeAction(false);
        };
    }, [abortCurrentWebSocket, props]);

    useEffect(() => abortCurrentWebSocket, [abortCurrentWebSocket]);

    return {
        connectWebSocket,
        updateWebSocketOffersRef,
        abortCurrentWebSocket,
    };
};
