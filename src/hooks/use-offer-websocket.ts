import { useRef, useCallback, useEffect } from 'react';
import { ParsedAddress } from '@/components/address-autocomplete-input';
import { Offer } from '@/types/offer';
import { WEBSOCKET_URL } from '@/config/constants';
import { WebSocketMessage } from '@/types/web-socket-message';

export type SlugType = 'INITIAL' | 'FINAL' | 'SHARED';

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
    onOffersReceived: (
        offers: Offer[],
        phase: 'INITIAL_OFFERS' | 'FINAL_OFFERS',
    ) => void;
    onWebSocketSlugReceived: (slug: string | null, slugType: SlugType) => void;
    onLoadingChange: (waitingForInitial: boolean) => void;
    onStatusUpdate: (msg: string) => void;
    onConnectionError: (msg: string) => void;
    onPendingOffersUpdate: (offers: Offer[] | null) => void;
    onPromptOpenChange: (open: boolean) => void;
    initialLoadingState: boolean;
}

export const useOfferWebSocket = ({
    parsedAddress,
    hasApiKey,
    providers,
    wantsFiber,
    onOffersReceived,
    onWebSocketSlugReceived,
    onLoadingChange,
    onStatusUpdate,
    onConnectionError,
    onPendingOffersUpdate,
    onPromptOpenChange,
    initialLoadingState,
}: UseOfferWebSocketProps) => {
    const ws = useRef<WebSocket | null>(null);
    const offersRef = useRef<Offer[]>([]);
    const initialOffersTimestampRef = useRef<number | null>(null);

    const connectWebSocket = useCallback(() => {
        if (!hasApiKey) {
            onConnectionError('Google Maps API Key is missing.');
            return;
        }
        if (!parsedAddress) {
            onStatusUpdate('Please select a valid German address.');
            return;
        }

        ws.current?.close(1000, 'New search');

        onLoadingChange(true);
        onStatusUpdate('Connecting…');
        onWebSocketSlugReceived(null, 'INITIAL');
        onPendingOffersUpdate(null);
        onPromptOpenChange(false);

        const sock = new WebSocket(WEBSOCKET_URL);
        ws.current = sock;

        sock.onopen = () => {
            if (sock.readyState === WebSocket.OPEN) {
                const payload = {
                    ...parsedAddress,
                    providers: providers.length ? providers : undefined,
                    wants_fiber: wantsFiber, // note snake_case for back‑end pydantic model
                } as Record<string, unknown>;

                sock.send(JSON.stringify(payload));
            }
        };

        sock.onmessage = (ev) => {
            let data: WebSocketMessage;
            try {
                data = JSON.parse(ev.data as string);
            } catch {
                onConnectionError('Malformed data from server.');
                onLoadingChange(false);
                return;
            }

            const uniqMap = new Map<string, Offer>();
            (data.offers ?? []).forEach((o) => {
                uniqMap.set(`${o.provider}-${o.product_id ?? o.plan_name}`, o);
            });
            const offers = Array.from(uniqMap.values());

            switch (data.type) {
                case 'INITIAL_OFFERS': {
                    if (data.slug) onWebSocketSlugReceived(data.slug, 'INITIAL');

                    onLoadingChange(false);
                    offersRef.current = offers;
                    initialOffersTimestampRef.current = Date.now();
                    onOffersReceived(offers, 'INITIAL_OFFERS');

                    onStatusUpdate(
                        data.message ??
                        `Received ${offers.length} offers. Refining search …`,
                    );
                    break;
                }
                case 'FINAL_OFFERS': {
                    if (data.slug) onWebSocketSlugReceived(data.slug, 'FINAL');

                    onLoadingChange(false);

                    const now = Date.now();
                    const initialTs = initialOffersTimestampRef.current;
                    const isQuickFinal = initialTs !== null && (now - initialTs) <= 3000;

                    // Auto-load if final offers arrive within 3 seconds of initial offers
                    if (isQuickFinal) {
                        offersRef.current = offers;
                        onOffersReceived(offers, 'FINAL_OFFERS');
                        onStatusUpdate(
                            data.message ??
                            `Search complete. ${offers.length} offers found.`
                        );
                    } else {
                        if (offersRef.current.length === 0) {
                            offersRef.current = offers;
                            onOffersReceived(offers, 'FINAL_OFFERS');
                        } else {
                            onPendingOffersUpdate(offers);
                            onPromptOpenChange(true);
                        }
                        onStatusUpdate(
                            data.message ??
                            `Search complete. ${offers.length} offers found.`
                        );
                    }

                    // Reset timestamp after handling
                    initialOffersTimestampRef.current = null;
                    break;
                }
                case 'STATUS_UPDATE': {
                    onStatusUpdate(data.message ?? 'Status update …');
                    break;
                }
                case 'ERROR':
                    onConnectionError(data.message ?? 'Web‑Socket error');
                    onLoadingChange(false);
                    sock.close();
                    break;
                default:
                    console.warn('Unknown WS type', data);
            }
        };

        sock.onerror = () => {
            onConnectionError('Connection error.');
            onLoadingChange(false);
        };

        sock.onclose = (e) => {
            if (!e.wasClean && e.code !== 1000) {
                onStatusUpdate('Connection lost – results may be incomplete.');
            }
        };
    }, [
        hasApiKey,
        parsedAddress,
        providers,
        wantsFiber,
        onLoadingChange,
        onStatusUpdate,
        onConnectionError,
        onWebSocketSlugReceived,
        onOffersReceived,
        onPendingOffersUpdate,
        onPromptOpenChange,
    ]);

    const updateWebSocketOffersRef = useCallback((offers: Offer[]) => {
        offersRef.current = offers;
    }, []);

    useEffect(() => {
        const s = ws.current;
        return () => {
            s?.close(1000, 'Component unmount');
        };
    }, []);

    return { connectWebSocket, updateWebSocketOffersRef };
};