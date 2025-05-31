"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ParsedAddress } from "@/components/compare/address-autocomplete-input";
import type { Offer } from "@/types/offer";
import { WEBSOCKET_URL } from "@/config/constants";
import type { WebSocketMessage } from "@/types/web-socket-message";
import { logger } from "@/utils/logger";

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
        willRefine: boolean
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

export const useOfferWebSocket = (props: UseOfferWebSocketProps) => {
    const genRef = useRef(0);
    const wsRef = useRef<WebSocket | null>(null);
    const firstBatchTsRef = useRef<number | null>(null);
    const offersRef = useRef<Offer[]>([]);
    const reconnectAttempts = useRef<number>(0);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Closes the active WebSocket connection and resets related state
    const abortCurrentWebSocket = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (wsRef.current) {
            wsRef.current.onopen =
                wsRef.current.onmessage =
                    wsRef.current.onerror =
                        wsRef.current.onclose =
                            null;
            wsRef.current.close(1000, "Aborted by navigation/search");
        }
        wsRef.current = null;
        firstBatchTsRef.current = null;
        reconnectAttempts.current = 0;
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

        // Validation
        if (!hasApiKey) {
            onConnectionErrorAction("Google Maps API key missing – cannot run search.");
            return;
        }
        if (!parsedAddress) {
            onStatusUpdateAction("Please select a valid German address first.");
            return;
        }

        onLoadingChangeAction(true);
        onWebSocketSlugReceivedAction(null, "INITIAL");

        const sock = new WebSocket(WEBSOCKET_URL);
        wsRef.current = sock;

        sock.onopen = () => {
            if (gen !== genRef.current) return;
            sock.send(
                JSON.stringify({
                    ...parsedAddress,
                    providers: providers.length ? providers : undefined,
                    wants_fiber: wantsFiber,
                })
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

            // Dedupe offers by provider+plan
            const seen = new Set<string>();
            const offers: Offer[] = [];
            (data.offers ?? []).forEach((o) => {
                const key = `${o.provider}-${o.product_id ?? o.plan_name}`;
                if (!seen.has(key)) {
                    offers.push(o);
                    seen.add(key);
                }
            });

            switch (data.type) {
                case "INITIAL_OFFERS": {
                    const willRefine = Boolean(data.will_refine);
                    firstBatchTsRef.current = Date.now();
                    offersRef.current = offers;

                    if (data.slug) {
                        onWebSocketSlugReceivedAction(data.slug, "INITIAL");
                    }

                    onOffersReceivedAction(offers, "INITIAL_OFFERS", willRefine);
                    if (data.message) {
                        onStatusUpdateAction(data.message);
                    }
                    onLoadingChangeAction(false);
                    break;
                }

                case "FINAL_OFFERS": {
                    // ────────────────────────────────────────────────────────────────────────────
                    // NEW: “No currently displayed offers” → immediately load these as if they were
                    // INITIAL, so that `handleWebSocketSlugReceived(..., "INITIAL")` still adds to recent searches.
                    if (offersRef.current.length === 0) {
                        if (data.slug) {
                            // Treat this slug as “INITIAL” to trigger the “add recent search” logic
                            onWebSocketSlugReceivedAction(data.slug, "INITIAL");
                        }
                        // Immediately push these offers into the UI:
                        offersRef.current = offers;
                        onOffersReceivedAction(offers, "FINAL_OFFERS", false);
                        if (data.message) {
                            onStatusUpdateAction(data.message);
                        }
                        onLoadingChangeAction(false);
                        firstBatchTsRef.current = null;
                        break;
                    }
                    // ────────────────────────────────────────────────────────────────────────────

                    const quick =
                        !!firstBatchTsRef.current &&
                        Date.now() - firstBatchTsRef.current <= 5_000;

                    if (quick) {
                        // Fast refinement: update offers immediately without prompting user
                        if (data.slug) {
                            onWebSocketSlugReceivedAction(data.slug, "FINAL");
                        }
                        offersRef.current = offers;
                        onOffersReceivedAction(offers, "FINAL_OFFERS", false);
                        if (data.message) {
                            onStatusUpdateAction(data.message);
                        }
                    } else {
                        // Slow refinement: if there are existing displayed offers, prompt for review
                        if (offersRef.current.length === 0) {
                            onOffersReceivedAction(offers, "FINAL_OFFERS", false);
                            if (data.message) {
                                onStatusUpdateAction(data.message);
                            }
                        } else {
                            onPendingOffersUpdateAction(offers, data.slug ?? null);
                            onPromptOpenChangeAction(true);
                            onOffersReceivedAction(offersRef.current, "FINAL_OFFERS", false);
                            if (data.message) {
                                onStatusUpdateAction(data.message);
                            }
                        }
                    }

                    onLoadingChangeAction(false);
                    firstBatchTsRef.current = null;
                    break;
                }

                case "STATUS_UPDATE":
                    if (data.message?.trim()) {
                        onStatusUpdateAction(data.message);
                    }
                    break;

                case "ERROR":
                    onConnectionErrorAction(data.message ?? "WebSocket connection error.");
                    onLoadingChangeAction(false);
                    break;

                default:
                    logger.warn(
                        "WebSocketHandler",
                        "Unknown WebSocket message type received",
                        data
                    );
            }
        };

        sock.onerror = () => {
            if (gen !== genRef.current) return;
            onConnectionErrorAction("A low-level WebSocket error occurred.");
            onLoadingChangeAction(false);
        };

        sock.onclose = (ev) => {
            if (gen !== genRef.current) return;
            if (ev.wasClean || ev.code === 1000) {
                return; // Expected closure—do not reconnect
            }

            onStatusUpdateAction("Connection lost. Attempting to reconnect...");
            if (reconnectAttempts.current >= 5) {
                onStatusUpdateAction(
                    "Connection failed after multiple attempts. Displaying last known results."
                );
                onLoadingChangeAction(false);
                return;
            }

            const backoffTime = Math.min(1000 * 2 ** reconnectAttempts.current, 30_000);
            reconnectAttempts.current += 1;

            reconnectTimeoutRef.current = setTimeout(() => {
                if (gen === genRef.current) {
                    onStatusUpdateAction(
                        `Reconnecting... (Attempt ${reconnectAttempts.current}/5)`
                    );
                    connectWebSocket();
                }
            }, backoffTime);

            if (reconnectAttempts.current === 1) {
                onLoadingChangeAction(true);
            }
        };
    }, [abortCurrentWebSocket, props]);

    useEffect(() => {
        return () => {
            abortCurrentWebSocket();
        };
    }, [abortCurrentWebSocket]);

    return {
        connectWebSocket,
        updateWebSocketOffersRef,
        abortCurrentWebSocket,
    };
};
