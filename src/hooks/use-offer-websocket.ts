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
 * @property initialLoadingState - Whether the hook should suppress loading UI initially.
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
    initialLoadingState: boolean;
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
  /* ────────── NEW: generation counter to identify the *current* socket ────────── */
  const generationRef = useRef(0);

  // Active WebSocket reference
  const ws = useRef<WebSocket | null>(null);
  // Latest displayed offers for diffing
  const offersRef = useRef<Offer[]>([]);
  // Whether a refinement is expected
  const expectingRefinementRef = useRef<boolean>(false);
  // Timestamp of initial offers
  const initialOffersTimestampRef = useRef<number | null>(null);

  /** Close helpers – called *before* a new socket is opened or on abort */
  const abortCurrentWebSocket = useCallback(() => {
    if (ws.current) {
      /*  Detach all handlers first so that *already-queued* messages are ignored  */
      ws.current.onopen    =
      ws.current.onmessage =
      ws.current.onerror   =
      ws.current.onclose   = null;

      ws.current.close(1000, "Aborted by navigation/search");
      ws.current = null;
    }
    expectingRefinementRef.current    = false;
    initialOffersTimestampRef.current = null;
  }, []);

  /** Initialize or reset the WebSocket connection for offer searches. */
  const connectWebSocket = useCallback(() => {
    /* ✂️  Abort whatever is still around – this increments the generation. */
    abortCurrentWebSocket();
    generationRef.current += 1;
    const thisGen = generationRef.current;

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

    if (!hasApiKey) {
      onConnectionErrorAction(
        "Google Maps API key is missing – cannot run search.",
      );
      return;
    }
    if (!parsedAddress) {
      onStatusUpdateAction("Please select a valid German address first.");
      return;
    }

    // Clean‑start every run --------------------------------------------------
    expectingRefinementRef.current = false;
    initialOffersTimestampRef.current = null;
    // ws.current?.close(1000, "New search initiated"); // replaced by abortCurrentWebSocket()
    onLoadingChangeAction(true);
    onStatusUpdateAction("Connecting to search service…");
    onWebSocketSlugReceivedAction(null, "INITIAL");
    onPendingOffersUpdateAction(null);
    onPromptOpenChangeAction(false);

    // Establish WebSocket connection
    const sock = new WebSocket(WEBSOCKET_URL);
    ws.current = sock;

    /* ---------------- open → immediately transmit query --------------- */
    sock.onopen = () => {
      if (thisGen !== generationRef.current) return;   // 🚫 stale
      if (sock.readyState !== WebSocket.OPEN) return;
      /** The exact payload shape expected by the FastAPI endpoint */
      const payload = {
        ...parsedAddress,
        providers: providers.length ? providers : undefined,
        wants_fiber: wantsFiber, // server expects snake_case
      } as Record<string, unknown>;
      sock.send(JSON.stringify(payload));
    };

    /* --------------- incoming message handler (the heavy bit) ---------- */
    sock.onmessage = (ev) => {
      if (thisGen !== generationRef.current) return;   // 🚫 stale
      let data: WebSocketMessage;
      try {
        data = JSON.parse(ev.data as string);
      } catch {
        onConnectionErrorAction("Malformed data from server.");
        onLoadingChangeAction(false);
        return;
      }

      // Always de‑duplicate the offers we receive – some providers are a bit chatty
      const uniqMap = new Map<string, Offer>();
      (data.offers ?? []).forEach((o) => {
        uniqMap.set(`${o.provider}-${o.product_id ?? o.plan_name}`, o);
      });
      const offers = Array.from(uniqMap.values());

      switch (data.type) {
        // INITIAL_OFFERS message
        case "INITIAL_OFFERS": {
          if (data.slug)
            onWebSocketSlugReceivedAction(data.slug, "INITIAL");

          const willRefine = Boolean(data.will_refine);
          expectingRefinementRef.current = willRefine;
          initialOffersTimestampRef.current = Date.now();
          offersRef.current = offers;

          // Emit upwards – UI decides whether to enter “Refining…”
          onOffersReceivedAction(offers, "INITIAL_OFFERS", willRefine);

          onStatusUpdateAction(
            data.message ??
              (willRefine
                ? `Loaded ${offers.length} offers – refining…`
                : `Loaded ${offers.length} offers – complete.`),
          );
          onLoadingChangeAction(false);
          break;
        }
        // FINAL_OFFERS message
        case "FINAL_OFFERS": {
          const initialTs = initialOffersTimestampRef.current;
          const prevOffers = offersRef.current;
          // If it arrives within 5 seconds just auto load them. User wont notice. And increases UX.
          const isQuickFinal = !!initialTs && Date.now() - initialTs <= 5000;

          // Never expect another refinement after FINAL
          expectingRefinementRef.current = false;

          // Update slug if provided
          if (data.slug) onWebSocketSlugReceivedAction(data.slug, "FINAL");

          // If we had no initial offers, or it arrived “quickly”, just switch immediately
          if (prevOffers.length === 0 || isQuickFinal) {
            offersRef.current = offers;
            onOffersReceivedAction(offers, "FINAL_OFFERS", false);
            onStatusUpdateAction(
              data.message ?? `Search complete. ${offers.length} offers found.`
            );

          } else {
            // Late final – only bother the user if there’s something new *and* we had shown something before
            const hasNewOffers =
              offers.length > 0 && offers.length !== prevOffers.length;

            if (hasNewOffers) {
              onPendingOffersUpdateAction(offers);
              onPromptOpenChangeAction(true);
              onStatusUpdateAction(
                data.message ??
                `Search finished – ${offers.length} refined offers ready.`
              );
            } else {
              // Nothing new – silently finish
              onOffersReceivedAction(offers, "FINAL_OFFERS", false);
              onStatusUpdateAction(
                data.message ?? "Search finished – no additional offers found."
              );
            }
          }

          onLoadingChangeAction(false);
          initialOffersTimestampRef.current = null;
          break;
        }
        // STATUS_UPDATE message
        case "STATUS_UPDATE": {
          onStatusUpdateAction(data.message ?? "Status update …");
          break;
        }
        // ERROR message
        case "ERROR": {
          onConnectionErrorAction(data.message ?? "Web‑Socket error.");
          onLoadingChangeAction(false);
          sock.close();
          break;
        }
        default: {
          // Unknown types are ignored but logged
          console.warn("Unknown WS message type", data);
        }
      }
    };

    // onerror handler
    sock.onerror = () => {
      if (thisGen !== generationRef.current) return;   // 🚫 stale
      onConnectionErrorAction("Low‑level Web‑Socket error.");
      onLoadingChangeAction(false);
    };

    // onclose handler
    sock.onclose = (e) => {
      if (thisGen !== generationRef.current) return;   // 🚫 stale
      // Ignore our own clean closes (1000)
      if (e.wasClean || e.code === 1000) return;

      onLoadingChangeAction(false);
      if (offersRef.current.length === 0) {
        onConnectionErrorAction("Connection lost before any offers arrived.");
      } else {
        onStatusUpdateAction("Connection lost – displaying partial results.");
      }
    };
  }, [
    abortCurrentWebSocket,
    props,
  ]);

  // Update the ref for currently displayed offers
  // replaced with inline function in return

  // Close WebSocket on unmount
  useEffect(() => {
    return () => abortCurrentWebSocket();
  }, [abortCurrentWebSocket]);

  // Public API
  return { connectWebSocket, updateWebSocketOffersRef: (o: Offer[]) => (offersRef.current = o), abortCurrentWebSocket };
};
