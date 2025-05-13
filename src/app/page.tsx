// app/compare/page.tsx
'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  FC,
  JSX,
} from 'react';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  Wifi,
  Timer,
  Building2,
  Gift,
  ChevronDown,
  List,
  LayoutGrid,
  Search as SearchIcon,
  Briefcase,
  Target,
  AlertCircle, // For API key warning
} from 'lucide-react';

import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
// Ensure this path is correct for your project structure
import { GoogleMapsLoader, AddressAutocompleteInput, ParsedAddress } from '@/components/address-autocomplete-input';


/* -------------------------------------------------------------------------- */
/*                               Type Definitions                             */
/* -------------------------------------------------------------------------- */

type ConnectionType = 'DSL' | 'Cable' | 'Fiber' | 'Mobile';
type VoucherKind = 'absolute' | 'percentage' | 'cashback' | 'discount';

interface Offer {
  provider: string;
  plan_name: string;
  product_id: string;
  speed_down_mbit: number;
  speed_up_mbit?: number | null;
  price_cents_month_intro: number;
  price_cents_month_regular?: number | null;
  contract_duration_months: number;
  connection_type: ConnectionType;
  voucher_type?: VoucherKind | null;
  voucher_value_cents?: number | null;
  voucher_value_percent?: number | null;
  // Add other fields that OfferCard might use from your original definition
  installation_service_included?: boolean;
  installation_cost_cents?: number | null;
  tv_included?: boolean;
  tv_package_name?: string | null;
  data_cap_gb?: number | null;
  max_age?: number | null;
}

interface WebSocketMessage {
  type: 'INITIAL_OFFERS' | 'FINAL_OFFERS' | 'ERROR' | 'STATUS_UPDATE';
  offers?: Offer[];
  slug?: string;
  message?: string;
  is_complete?: boolean;
}

/* -------------------------------------------------------------------------- */
/*                                  Constants                                 */
/* -------------------------------------------------------------------------- */

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL?.trim() ?? 'http://localhost:8000';
const WEBSOCKET_URL = API_BASE_URL.replace(/^http/i, 'ws') + '/ws/compare';
const GOOGLE_MAPS_API_KEY_FROM_ENV = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";


/* -------------------------------------------------------------------------- */
/*                               Utility Functions                            */
/* -------------------------------------------------------------------------- */
const formatEur = (cents: number | null | undefined): string =>
    cents == null
        ? '–'
        : new Intl.NumberFormat('de-DE', {
          style: 'currency',
          currency: 'EUR',
        }).format(cents / 100);

/* -------------------------------------------------------------------------- */
/*                                Main Page Component                         */
/* -------------------------------------------------------------------------- */
export default function ComparePage(): JSX.Element {
  const [parsedBackendAddress, setParsedBackendAddress] = useState<ParsedAddress | null>(null);
  // searchAddressDisplayString is managed internally by AddressAutocompleteInput's `value`
  // We only need to react to `parsedBackendAddress`.

  const [offers, setOffers] = useState<Offer[]>([]);
  const offersRef = useRef<Offer[]>([]);
  useEffect(() => { offersRef.current = offers; }, [offers]);

  const [pendingOffers, setPendingOffers] = useState<Offer[] | null>(null);
  const [status, setStatus] = useState<string>('Enter an address to compare internet plans.');
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [promptOpen, setPromptOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const ws = useRef<WebSocket | null>(null);

  // Check for API key presence for UI feedback
  const hasApiKey = !!GOOGLE_MAPS_API_KEY_FROM_ENV;

  const isSearchDisabled = loading || !parsedBackendAddress || !hasApiKey;

  const resetForSearch = (): void => {
    setOffers([]);
    setPendingOffers(null);
    setPromptOpen(false);
    setLoading(true);
  };

  const handleAddressSelected = useCallback((address: ParsedAddress | null, fullText: string): void => {
    console.log('[ComparePage] Address selected/parsed:', address, 'Full text:', fullText);
    setParsedBackendAddress(address); // This is the crucial update

    if (address) {
      // All components (street, house_number, city, plz, country_code="DE", valid PLZ) are present
      setStatus(`Address ready: ${address.street} ${address.house_number}, ${address.plz} ${address.city}.`);
    } else if (fullText && fullText.trim().length > 0) {
      setStatus(`Could not fully verify "${fullText}". Ensure all address parts (street, number, city, 5-digit PLZ) are clear.`);
    } else {
      setStatus('Enter a complete German address to compare internet plans.');
    }
  }, []);

  const connect = useCallback((): void => {
    if (!hasApiKey) {
      setStatus("Google Maps API Key is missing. Address search cannot function.");
      console.error("Connect: Google Maps API Key is not configured.");
      return;
    }
    if (!parsedBackendAddress) {
      // This state should ideally be caught by the disabled button, but as a safeguard:
      setStatus('Please select a complete and valid German address first.');
      console.warn("Connect: Attempted to connect without a parsed address.");
      return;
    }

    // The `parseGeocodeResult` in AddressAutocompleteInput already validates.
    // If `parsedBackendAddress` is not null, it means it passed those checks.
    // So, no need for redundant validation here, assuming `parseGeocodeResult` is trusted.

    ws.current?.close(1000, 'New search initiated by user');
    resetForSearch();
    setStatus('Connecting to comparison service…');

    const addressToSend = { ...parsedBackendAddress }; // Send a copy

    ws.current = new WebSocket(WEBSOCKET_URL);

    ws.current.onopen = () => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify(addressToSend));
        setStatus(`Fetching offers for ${addressToSend.street} ${addressToSend.house_number}, ${addressToSend.plz} ${addressToSend.city}...`);
      } else {
        setStatus("Failed to open WebSocket connection. Please try again.");
        setLoading(false);
      }
    };

    // ... (onmessage, onerror, onclose handlers remain the same as your previous version)
    ws.current.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as WebSocketMessage;
        console.debug('[WebSocket Message Received]', data);

        switch (data.type) {
          case 'INITIAL_OFFERS':
            setOffers(data.offers ?? []);
            setStatus(`Received ${data.offers?.length ?? 0} initial offers. Refining search...`);
            setLoading(Boolean(data.is_complete === false));
            break;
          case 'FINAL_OFFERS':
            const finalBatch = data.offers ?? [];
            setSlug(data.slug ?? null);
            setLoading(false);
            if (offersRef.current.length > 0 && finalBatch.length !== offersRef.current.length) {
              setPendingOffers(finalBatch);
              setPromptOpen(true);
            } else {
              setOffers(finalBatch);
            }
            setStatus(`Search complete. ${finalBatch.length} offers found.`);
            break;
          case 'STATUS_UPDATE':
            setStatus(data.message ?? 'Receiving status update...');
            break;
          case 'ERROR':
            setStatus(`Error: ${data.message ?? 'An unknown error occurred.'}`);
            console.error('WebSocket Error Message:', data.message);
            setLoading(false);
            ws.current?.close();
            break;
          default:
            console.warn('Received unknown WebSocket message type:', data);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', ev.data, error);
        setStatus('Error: Received malformed data from server.');
        setLoading(false);
      }
    };

    ws.current.onerror = (event) => {
      console.error('WebSocket Error:', event);
      setStatus('Connection error. Please check the server or your network.');
      setLoading(false);
    };

    ws.current.onclose = (event) => {
      console.debug('[WebSocket Closed]', `Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
      if (loading && !event.wasClean && event.code !== 1000) {
        setStatus('Connection lost. Search results might be incomplete.');
      }
      setLoading(false);
    };
  }, [parsedBackendAddress, loading, hasApiKey]); // Add hasApiKey dependency

  const showPending = (): void => {
    if (pendingOffers) {
      setOffers(pendingOffers);
      setStatus(`Displaying updated results (${pendingOffers.length} offers).`);
    }
    setPendingOffers(null);
    setPromptOpen(false);
  };

  useEffect(() => {
    return () => {
      ws.current?.close(1000, 'Component unmounting');
    };
  }, []);

  const ProviderLogo: FC<{ providerName: string; className?: string }> = ({ providerName, className }) => {
    let IconComponent: React.ElementType = Building2;
    if (providerName.toLowerCase().includes('webwunder')) IconComponent = Wifi;
    else if (providerName.toLowerCase().includes('byteme')) IconComponent = Briefcase;
    else if (providerName.toLowerCase().includes('ping perfect')) IconComponent = Target;
    return (
        <div className={cn('flex items-center justify-center size-10 rounded-full bg-slate-700 text-white p-2', className)} title={providerName}>
          <IconComponent className="size-5" />
        </div>
    );
  };

  const OfferCard: FC<{ offer: Offer }> = ({ offer }) => {
    const hasRegularPrice = offer.price_cents_month_regular != null && offer.price_cents_month_regular !== offer.price_cents_month_intro;
    const introPriceLabel = `${offer.contract_duration_months} Mo.`;
    const regularPriceLabel = 'Regular';
    return (
        <motion.div layout initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="h-full">
          <Card className="h-full bg-[#1A1F4A]/80 backdrop-blur-md border-slate-700 text-slate-100 flex flex-col p-6 rounded-xl shadow-xl hover:shadow-indigo-500/30 transition-shadow">
            <div className="flex items-center gap-3 mb-3"><ProviderLogo providerName={offer.provider} /><div><h3 className="text-lg font-semibold text-white">{offer.provider}</h3><p className="text-sm text-slate-400 -mt-1">{offer.plan_name}</p></div></div>
            <div className="flex items-end justify-around gap-4 my-4 text-center"><div><span className="block text-4xl font-bold text-white leading-none">{offer.speed_down_mbit}</span><span className="text-xs text-slate-400">Mbps Down</span></div>{offer.speed_up_mbit != null && (<><div className="h-10 border-l border-slate-600"></div><div><span className="block text-4xl font-bold text-white leading-none">{offer.speed_up_mbit}</span><span className="text-xs text-slate-400">Mbps Up</span></div></>)}</div>
            <div className="flex-grow"></div>
            <div className="mt-auto pt-4 border-t border-slate-700/50"><div className="flex justify-around items-end gap-2 text-center"><div><span className="block text-2xl font-bold text-white">{formatEur(offer.price_cents_month_intro)}</span><span className="text-xs text-slate-400">{introPriceLabel}</span></div>{hasRegularPrice && (<><div className="h-8 border-l border-slate-600 self-center"></div><div><span className="block text-2xl font-bold text-white">{formatEur(offer.price_cents_month_regular)}</span><span className="text-xs text-slate-400">{regularPriceLabel}</span></div></>)}</div>{offer.voucher_type && (<div className="mt-3 text-center"><span className="inline-flex items-center gap-1.5 text-xs bg-green-600/20 text-green-300 px-2 py-1 rounded-full"><Gift className="size-3" />{offer.voucher_type === 'absolute' || offer.voucher_type === 'cashback' ? `${formatEur(offer.voucher_value_cents ?? 0)} ${offer.voucher_type === 'cashback' ? 'Cashback' : 'Bonus'}`: `${offer.voucher_value_percent}% Discount`}</span></div>)}</div>
          </Card>
        </motion.div>
    );
  };

  const UpdatePromptDialog = () => (
      <AlertDialog open={promptOpen} onOpenChange={setPromptOpen}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white"><AlertDialogHeader><AlertDialogTitle>New Offers Available</AlertDialogTitle><AlertDialogDescription className="text-slate-400">The full search has returned additional offers. Would you like to display them?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setPromptOpen(false)} className="bg-transparent border-slate-600 hover:bg-slate-700 text-slate-300 hover:text-white">Later</AlertDialogCancel><AlertDialogAction onClick={showPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">Show Offers ({pendingOffers?.length ?? 0})</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
  );

  return (
      <> {/* Need to wrap GoogleMapsLoader and the page content */}
        <GoogleMapsLoader /> {/* Place the loader here, it will load the script */}
        <div className="min-h-screen bg-gradient-to-br from-[#0B0B2D] via-[#1C1044] to-[#3C0E4C] text-slate-100 selection:bg-indigo-500 selection:text-white">
          <main className="container mx-auto max-w-7xl px-4 py-12 sm:py-16 space-y-10 sm:space-y-12">
            <UpdatePromptDialog />

            <header className="text-center space-y-2">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
                Compare Internet Providers
              </h1>
              {!hasApiKey && (
                  <p className="text-sm text-red-400 flex items-center justify-center gap-2">
                    <AlertCircle className="size-4" />
                    Google Maps API Key missing. Address search is disabled.
                  </p>
              )}
              {status && <p className="text-sm text-slate-400 min-h-[20px]">{status}</p>}
            </header>

            <section className="max-w-2xl mx-auto">
              {/* items-stretch is important for the button to match input height if input height is set via its own class */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <AddressAutocompleteInput
                    initialValue="" // Or a default placeholder if you wish
                    onAddressSelect={handleAddressSelected}
                    // The Input inside AddressAutocompleteInput has h-12
                    inputClassName="bg-slate-800/50 border-slate-700 placeholder:text-slate-400 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" // Removed h-12, it's in component now
                    containerClassName="flex-grow"
                />
                <Button
                    onClick={connect}
                    disabled={isSearchDisabled} // Use the derived state
                    className={cn(
                        "bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 rounded-lg w-full sm:w-auto text-base shrink-0",
                        "h-12" // Explicitly set height for the button to match input
                    )}
                    size="lg" // shadcn "lg" size often corresponds to h-12 or similar
                >
                  {loading ? (
                      <><Timer className="animate-spin size-5 mr-2" />Searching...</>
                  ) : (
                      <><SearchIcon className="size-5 mr-2" />Search</>
                  )}
                </Button>
              </div>
            </section>

            {/* Filters and View Options (no changes from your version) */}
            <section className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 md:gap-x-6 text-sm text-slate-300">
              {(['Contract Duration', 'Sort By', 'Lowest Price'] as const).map((label) => (<DropdownMenu key={label}><DropdownMenuTrigger asChild><Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700/50 px-3 py-1.5" disabled={loading || offers.length === 0}>{label}<ChevronDown className="ml-2 size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent className="bg-slate-800 border-slate-700 text-slate-200"><DropdownMenuItem className="focus:bg-slate-700 focus:text-white">Any</DropdownMenuItem><DropdownMenuItem className="focus:bg-slate-700 focus:text-white">{label === 'Sort By' ? 'Provider A-Z' : 'Option 1'}</DropdownMenuItem><DropdownMenuItem className="focus:bg-slate-700 focus:text-white">{label === 'Sort By' ? 'Speed (Fastest)' : 'Option 2'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>))}
              <div className="flex items-center gap-2"><span className="text-slate-400">View:</span><ToggleGroup type="single" value={viewMode} onValueChange={(value) => { if (value) setViewMode(value as 'grid' | 'list'); }} className="bg-slate-800/60 rounded-md p-0.5" disabled={loading || offers.length === 0}><ToggleGroupItem value="grid" aria-label="Grid view" className="data-[state=on]:bg-indigo-600 data-[state=on]:text-white text-slate-400 hover:text-white px-2.5 py-1"><LayoutGrid className="size-4" /></ToggleGroupItem><ToggleGroupItem value="list" aria-label="List view"  className="data-[state=on]:bg-indigo-600 data-[state=on]:text-white text-slate-400 hover:text-white px-2.5 py-1"><List className="size-4" /></ToggleGroupItem></ToggleGroup></div>
            </section>

            {/* Offer Grid / List (no changes from your version) */}
            <section>
              {loading && offers.length === 0 && (<div className={cn("grid gap-6", viewMode === 'grid' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3" : "grid-cols-1")}>{Array.from({ length: viewMode === 'grid' ? 6 : 3 }).map((_, i) => (<Skeleton key={i} className="h-64 w-full rounded-xl bg-slate-700/50" />))}</div>)}
              {!loading && offers.length === 0 && status && !status.toLowerCase().includes('error') && !status.toLowerCase().includes('connecting') && !status.toLowerCase().includes('refining') && !status.toLowerCase().includes('initial offers') && (<div className="text-center py-10"><Wifi className="mx-auto size-16 text-slate-500 mb-4" /><p className="text-slate-400 text-lg">No offers found for this address.</p><p className="text-slate-500 text-sm">Please ensure the address is correct and try again, or try a different address.</p></div>)}
              {offers.length > 0 && (<ScrollArea className={cn("overflow-y-auto", "max-h-[calc(100vh-420px)] sm:max-h-[calc(100vh-380px)]")}><AnimatePresence mode="popLayout"><div className={cn("grid gap-5 sm:gap-6 p-1", viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1 space-y-4")}>{offers.map((o, i) => (<OfferCard key={`${o.provider}-${o.product_id}-${i}`} offer={o} />))}</div></AnimatePresence></ScrollArea>)}
            </section>
          </main>
        </div>
      </>
  );
}