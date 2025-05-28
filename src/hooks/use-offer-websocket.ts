"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ParsedAddress } from "@/components/compare/address-autocomplete-input";
import type { Offer } from "@/types/offer";
import { WEBSOCKET_URL } from "@/config/constants";
import type { WebSocketMessage } from "@/types/web-socket-message";

/* ───────────────── types ───────────────── */
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

    /** ➊ now also hands over a *pending* slug */
    onPendingOffersUpdateAction: (offers: Offer[] | null, slug: string | null) => void;
    onPromptOpenChangeAction: (open: boolean) => void;

    initialLoadingState: boolean;
}

/* ───────────────── hook ───────────────── */
export const useOfferWebSocket = (props: UseOfferWebSocketProps) => {
    const genRef             = useRef(0);
    const wsRef              = useRef<WebSocket | null>(null);
    const firstBatchTsRef    = useRef<number | null>(null);
    const offersRef          = useRef<Offer[]>([]);

    /* helper ─ close current socket */
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

    /* helper ─ keep ComparePage in sync (still used elsewhere) */
    const updateWebSocketOffersRef = useCallback((offers: Offer[]) => {
        offersRef.current = offers;
    }, []);

    /* (re)connect */
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

        /* guard clauses */
        if (!hasApiKey) {
            onConnectionErrorAction("Google Maps API key missing – cannot run search.");
            return;
        }
        if (!parsedAddress) {
            onStatusUpdateAction("Please select a valid German address first.");
            return;
        }

        /* bootstrap UI state */
        onLoadingChangeAction(true);
        onWebSocketSlugReceivedAction(null, "INITIAL");

        /* real socket */
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

            /* de-duplicate offers */
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
                /* ─── INITIAL ─── */
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

                /* ─── FINAL ─── */
                /* inside sock.onmessage … switch (data.type) … */
                case "FINAL_OFFERS": {
                    const quick =
                        !!firstBatchTsRef.current &&
                        Date.now() - firstBatchTsRef.current <= 5_000;

                    if (quick) {
                        /* ─── quick refinement → load immediately ─── */
                        if (data.slug) onWebSocketSlugReceivedAction(data.slug, "FINAL");

                        offersRef.current = offers;
                        onOffersReceivedAction(offers, "FINAL_OFFERS", false);
                        if (data.message) {
                            onStatusUpdateAction(
                                data.message
                            );
                        }
                    } else {
                        /* ─── slow refinement → prompt ─── */

                        /* ➊ park offers *and* slug for later */
                        onPendingOffersUpdateAction(offers, data.slug ?? null);

                        /* ➋ open the “new results” dialog */
                        onPromptOpenChangeAction(true);

                        /* ➌ stop the spinner WITHOUT changing the list
                           (pass the *current* offers that are on screen) */
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


                /* ─── STATUS ─── */
                case "STATUS_UPDATE":
                    if (data.message?.trim()) onStatusUpdateAction(data.message);
                    break;

                /* ─── ERROR ─── */
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
