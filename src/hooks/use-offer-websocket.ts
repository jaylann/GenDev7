import { useRef, useCallback, useEffect } from 'react';
import { ParsedAddress } from '@/components/address-autocomplete-input';
import { Offer } from '@/types/offer';
import { WEBSOCKET_URL } from '@/config/constants';
import { WebSocketMessage } from '@/types/web-socket-message';

export type SlugType = 'INITIAL' | 'FINAL' | 'SHARED';

interface UseOfferWebSocketProps {
    parsedAddress: ParsedAddress | null;
    hasApiKey: boolean;
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
                sock.send(JSON.stringify(parsedAddress));
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
                // ----------------------- INITIAL -----------------------
                case 'INITIAL_OFFERS': {
                    if (data.slug) onWebSocketSlugReceived(data.slug, 'INITIAL');

                    onLoadingChange(false); // spinner off
                    offersRef.current = offers;
                    onOffersReceived(offers, 'INITIAL_OFFERS');

                    onStatusUpdate(
                        data.message ??
                        `Received ${offers.length} offers. Refining search …`,
                    );
                    break;
                }

                // ----------------------- FINAL -------------------------
                case 'FINAL_OFFERS': {
                    if (data.slug) onWebSocketSlugReceived(data.slug, 'FINAL');

                    onLoadingChange(false); // already off, but keep consistent

                    if (offersRef.current.length === 0) {
                        // No initial offers → just show them
                        offersRef.current = offers;
                        onOffersReceived(offers, 'FINAL_OFFERS');
                    } else {
                        // Store as “pending” until user confirms
                        onPendingOffersUpdate(offers);
                        onPromptOpenChange(true);
                    }

                    onStatusUpdate(
                        data.message ??
                        `Search complete. ${offers.length} offers found.`,
                    );
                    break;
                }

                // ----------------------- STATUS ------------------------
                case 'STATUS_UPDATE':
                    onStatusUpdate(data.message ?? 'Status update …');
                    break;

                // ----------------------- ERROR -------------------------
                case 'ERROR':
                    onConnectionError(data.message ?? 'Web-Socket error');
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
