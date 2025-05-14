// app/compare/page.tsx
'use client';

import React, {JSX, useCallback, useEffect, useMemo, useRef, useState,} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';

// Shadcn UI Components
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {Button} from '@/components/ui/button';
import {ScrollArea} from '@/components/ui/scroll-area';
import {Skeleton} from '@/components/ui/skeleton';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,} from '@/components/ui/dropdown-menu';
import {ToggleGroup, ToggleGroupItem} from "@/components/ui/toggle-group";
import {Badge} from "@/components/ui/badge";
import {Label} from "@/components/ui/label";
import {Checkbox} from "@/components/ui/checkbox";
import {RadioGroup, RadioGroupItem} from "@/components/ui/radio-group";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Slider} from "@/components/ui/slider";

// Lucide React Icons
import {
    AlertCircle,
    ChevronDown,
    LayoutGrid,
    List,
    Search as SearchIcon,
    Share2,
    SlidersHorizontal,
    Timer,
    Wifi,
    X as XIcon,
} from 'lucide-react';

// Animation
import {AnimatePresence} from 'framer-motion';

// Utilities
import {cn} from '@/lib/utils';

// Custom Components
import {AddressAutocompleteInput, GoogleMapsLoader, ParsedAddress} from '@/components/address-autocomplete-input';
import {FiltersState} from "@/types/filters-state";
import {Offer} from "@/types/offer";
import {SortOptionKey} from "@/types/sort-option-key";
import {
    AVAILABLE_CONNECTION_TYPES,
    AVAILABLE_CONTRACT_DURATIONS,
    DEFAULT_FILTERS,
    GOOGLE_MAPS_API_KEY_FROM_ENV,
    MAX_SPEED_FALLBACK,
    SORT_OPTIONS,
    WEBSOCKET_URL
} from "@/config/constants";
import {deserializeFiltersFromURL, serializeFiltersForURL} from '@/utils/url';
import {WebSocketMessage} from "@/types/web-socket-message";
import {calculateEffectivePriceForSorting, calculateRecommendationScore} from "@/utils/calculations";
import {OfferCard} from "@/components/compare/offer-card";


/* -------------------------------------------------------------------------- */
/*                            Main Page Component                             */
/* -------------------------------------------------------------------------- */
export default function ComparePage(): JSX.Element {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [parsedBackendAddress, setParsedBackendAddress] = useState<ParsedAddress | null>(null);
    const [originalOffers, setOriginalOffers] = useState<Offer[]>([]);
    const [processedOffers, setProcessedOffers] = useState<Offer[]>([]);
    const [status, setStatus] = useState<string>('Enter an address to compare internet plans.');
    const [slug, setSlug] = useState<string | null>(null); // For shareable link
    const [loading, setLoading] = useState<boolean>(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [sortOption, setSortOption] = useState<SortOptionKey>('recommended');
    const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
    // Draft state for filters in the popover
    const [draftFilters, setDraftFilters] = useState<FiltersState>(DEFAULT_FILTERS);
    // Helper to update draft filters
    const handleDraftFilterChange = <K extends keyof FiltersState>(filterKey: K, value: FiltersState[K]) => setDraftFilters(prev => ({
        ...prev, [filterKey]: value
    }));
    const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
    const [sharedLinkCopied, setSharedLinkCopied] = useState<boolean>(false);
    const [isLoadingFromSlug, setIsLoadingFromSlug] = useState<boolean>(true); // Initialize true

    const ws = useRef<WebSocket | null>(null);
    const hasApiKey = !!GOOGLE_MAPS_API_KEY_FROM_ENV;
    const offersRef = useRef<Offer[]>([]);
    useEffect(() => {
        offersRef.current = originalOffers;
    }, [originalOffers]);
    const [pendingOffers, setPendingOffers] = useState<Offer[] | null>(null);
    const [promptOpen, setPromptOpen] = useState<boolean>(false);

    const isSearchDisabled = loading || !parsedBackendAddress || !hasApiKey || isLoadingFromSlug;

    const resetForSearch = useCallback((): void => {
        setOriginalOffers([]);
        setProcessedOffers([]);
        setPendingOffers(null);
        setPromptOpen(false);
        setLoading(true);
        setSlug(null); // Clear slug for new search so URL updates correctly if search fails early
    }, []);

    // Effect to initialize state from URL parameters on mount
    useEffect(() => {
        const slugFromUrl = searchParams.get('slug');
        const sortFromUrl = searchParams.get('sort') as SortOptionKey | null;
        const filtersFromUrl = deserializeFiltersFromURL(searchParams);

        const performInitialSetup = () => {
            if (sortFromUrl && SORT_OPTIONS.some(s => s.key === sortFromUrl)) {
                setSortOption(sortFromUrl);
            }
            if (Object.keys(filtersFromUrl).length > 0) {
                const newFilters = {...DEFAULT_FILTERS, ...filtersFromUrl};
                setFilters(newFilters);
                setDraftFilters(newFilters); // Sync draft filters too
            }
            setIsLoadingFromSlug(false); // Allow normal operations now
        };

        if (slugFromUrl) {
            setStatus(`Loading shared comparison (slug: ${slugFromUrl})...`);
            setLoading(true);

            const fetchSharedOffers = async () => {
                try {
                    const response = await fetch(`/api/get-shared-offers?slug=${slugFromUrl}`);
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({error: "Failed to parse error response"}));
                        throw new Error(errorData.error || `Failed to fetch shared offers: ${response.statusText}`);
                    }
                    const data: { offers: Offer[], slug: string } = await response.json();
                    setOriginalOffers(data.offers);
                    setSlug(data.slug); // Set slug from fetched data
                    setStatus(`Loaded ${data.offers.length} shared offers.`);
                } catch (error: any) {
                    console.error("Error loading shared offers:", error);
                    setStatus(`Error: Could not load shared comparison. ${error.message}. Link may be invalid or expired.`);
                    setOriginalOffers([]);
                    setSlug(null);
                } finally {
                    setLoading(false);
                    performInitialSetup();
                }
            };
            fetchSharedOffers();
        } else {
            performInitialSetup();
        } // No slug, just apply other params and proceed
    }, []);

    const handleAddressSelected = useCallback((address: ParsedAddress | null, fullText: string): void => {
        setParsedBackendAddress(address);
        if (address) setStatus(`Address ready: ${address.street} ${address.house_number}, ${address.plz} ${address.city}. Click Search!`); else if (fullText?.trim().length > 0) setStatus(`Could not fully verify "${fullText}". Ensure all address parts are clear.`); else setStatus('Enter a complete German address to compare internet plans.');
    }, []);

    const connect = useCallback((): void => {
        if (!hasApiKey) {
            setStatus("Google Maps API Key is missing. Address search cannot function.");
            return;
        }
        if (!parsedBackendAddress) {
            setStatus('Please select a complete and valid German address first.');
            return;
        }

        ws.current?.close(1000, 'New search initiated by user');
        resetForSearch();
        setStatus('Connecting to comparison service…');
        const addressToSend = {...parsedBackendAddress};
        ws.current = new WebSocket(WEBSOCKET_URL);

        ws.current.onopen = () => {
            if (ws.current?.readyState === WebSocket.OPEN && !isLoadingFromSlug) { // Ensure we don't send if loading from slug initates WS later
                ws.current.send(JSON.stringify(addressToSend));
                setStatus(`Fetching offers for ${addressToSend.street} ${addressToSend.house_number}, ${addressToSend.plz} ${addressToSend.city}...`);
            } else {
                setStatus("Failed to open WebSocket connection. Please try again.");
                setLoading(false);
            }
        };

        ws.current.onmessage = (ev) => {
            try {
                const data = JSON.parse(ev.data as string) as WebSocketMessage;
                const uniqueOfferMap = new Map<string, Offer>();
                (data.offers ?? []).forEach(offer => {
                    const key = `${offer.provider}-${offer.product_id}`; // Simple deduplication key
                    if (!uniqueOfferMap.has(key)) uniqueOfferMap.set(key, offer);
                });
                const newOffers = Array.from(uniqueOfferMap.values());

                switch (data.type) {
                    case 'INITIAL_OFFERS':
                        setOriginalOffers(newOffers);
                        setSlug(data.slug ?? null); // Set slug from initial offers
                        setLoading(Boolean(data.is_complete === false));
                        break;
                    case 'FINAL_OFFERS':
                        setSlug(data.slug ?? null);
                        setLoading(false);
                        if (offersRef.current.length > 0 && newOffers.length !== offersRef.current.length) { // Basic check for changes
                            setPendingOffers(newOffers);
                            setPromptOpen(true);
                        } else {
                            setOriginalOffers(newOffers);
                        }
                        setStatus(`Search complete. ${newOffers.length} offers found.` + (data.slug ? ` Shareable link available.` : ''));
                        break;
                    case 'STATUS_UPDATE':
                        setStatus(data.message ?? 'Receiving status update...');
                        break;
                    case 'ERROR':
                        setStatus(`Error: ${data.message ?? 'An unknown error occurred.'}`);
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
            setStatus('Connection error. Please check your network or if the server is running.');
            setLoading(false);
        };
        ws.current.onclose = (event) => {
            if (loading && !event.wasClean && event.code !== 1000) setStatus('Connection lost. Search results might be incomplete.');
            if (loading) setLoading(false);
        };
    }, [parsedBackendAddress, loading, hasApiKey, resetForSearch]);

    useEffect(() => {
        if (originalOffers.length === 0 && !loading) {
            setProcessedOffers([]);
            return;
        }

        const enrichedOffers = originalOffers
            .map(offer => ({...offer, effective_price_24_months: calculateEffectivePriceForSorting(offer)}))
            .map((offer, _, allEnriched) => ({
                ...offer, recommendation_score: calculateRecommendationScore(offer, allEnriched)
            }));

        let filtered = [...enrichedOffers].filter(offer => {
            if (filters.contractDurations.length > 0 && !filters.contractDurations.includes(offer.contract_duration_months)) return false;
            if (filters.connectionTypes.length > 0 && !filters.connectionTypes.includes(offer.connection_type)) return false;
            if (filters.minSpeed > 0 && offer.speed_down_mbit < filters.minSpeed) return false;
            if (filters.tvIncluded === 'yes' && !offer.tv_included) return false;
            if (filters.tvIncluded === 'no' && offer.tv_included) return false;
            if (filters.selectedProviders.length > 0 && !filters.selectedProviders.includes(offer.provider)) return false;
            if (filters.youthOffer === 'yes' && offer.max_age == null) return false;
            return true;
        });

        switch (sortOption) {
            case 'recommended':
                filtered.sort((a, b) => (b.recommendation_score ?? 0) - (a.recommendation_score ?? 0));
                break;
            case 'price_asc':
                filtered.sort((a, b) => (a.effective_price_24_months ?? Infinity) - (b.effective_price_24_months ?? Infinity));
                break;
            case 'speed_desc':
                filtered.sort((a, b) => b.speed_down_mbit - a.speed_down_mbit);
                break;
            case 'duration_asc':
                filtered.sort((a, b) => a.contract_duration_months - b.contract_duration_months);
                break;
            case 'provider_asc':
                filtered.sort((a, b) => a.provider.localeCompare(b.provider));
                break;
        }
        setProcessedOffers(filtered);
    }, [originalOffers, sortOption, filters, loading]);

    // Dialog for new offers (defined within component to access state)
    const showPending = (): void => {
        if (pendingOffers) {
            setOriginalOffers(pendingOffers);
            setStatus(`Displaying updated results (${pendingOffers.length} offers).`);
        }
        setPendingOffers(null);
        setPromptOpen(false);
    };
    // Cleanup WebSocket on unmount
    useEffect(() => () => ws.current?.close(1000, 'Component unmounting'), []);

    const uniqueProviders = useMemo(() => Array.from(new Set(originalOffers.map(o => o.provider))).sort(), [originalOffers]);
    const uniqueContractDurations = useMemo(() => Array.from(new Set(originalOffers.map(o => o.contract_duration_months))).sort((a, b) => a - b), [originalOffers]);
    const maxSpeedAvailable = useMemo(() => originalOffers.length === 0 ? MAX_SPEED_FALLBACK : Math.max(...originalOffers.map(o => o.speed_down_mbit), 50), [originalOffers]); // Min 50 for slider

    const handleFilterChange = <K extends keyof FiltersState>(filterKey: K, value: FiltersState[K]) => setFilters(prev => ({ // This function is unused in the final code as handleDraftFilterChange is used instead. Can be removed.
        ...prev, [filterKey]: value
    }));
    const resetAllFilters = () => setFilters(DEFAULT_FILTERS);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filters.contractDurations.length > 0) count++;
        if (filters.connectionTypes.length > 0) count++;
        if (filters.minSpeed > 0) count++;
        if (filters.tvIncluded !== 'any') count++;
        if (filters.selectedProviders.length > 0) count++;
        if (filters.youthOffer !== 'any') count++;
        return count;
    }, [filters]);

    // Handle Share button click
    const handleShare = useCallback(async () => {
        if (!slug) {
            setStatus("Cannot share yet, no results loaded or identified.");
            return;
        }
        const queryParams = new URLSearchParams();
        queryParams.set('slug', slug);
        queryParams.set('sort', sortOption);
        const filterQueryString = serializeFiltersForURL(filters);
        if (filterQueryString) {
            const filterParams = new URLSearchParams(filterQueryString);
            filterParams.forEach((value, key) => queryParams.set(key, value));
        }
        const shareUrl = `${window.location.origin}${window.location.pathname}?${queryParams.toString()}`;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setSharedLinkCopied(true);
            setStatus('Link copied to clipboard!');
            setTimeout(() => {
                setSharedLinkCopied(false);
            }, 2500);
        } catch (err) {
            console.error('Failed to copy share link: ', err);
            setStatus('Failed to copy link. Please try manually.');
        }
    }, [slug, sortOption, filters]);

    // Alert Dialog for new offers
    const UpdatePromptDialog = () => (<AlertDialog open={promptOpen} onOpenChange={setPromptOpen}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
            <AlertDialogHeader>
                <AlertDialogTitle>New Offers Available</AlertDialogTitle>
                <AlertDialogDescription className="text-slate-400">
                    The full search has returned additional/updated offers. Would you like to display them?
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setPromptOpen(false)}
                                   className="bg-transparent border-slate-600 hover:bg-slate-700 text-slate-300 hover:text-white">Later</AlertDialogCancel>
                <AlertDialogAction onClick={showPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">Show
                    Offers ({pendingOffers?.length ?? 0})</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>);

    return (<>
        <GoogleMapsLoader/>
        <div
            className="min-h-screen bg-gradient-to-br from-[#0B0B2D] via-[#1C1044] to-[#3C0E4C] text-slate-100 selection:bg-indigo-500 selection:text-white">
            <main className="container mx-auto max-w-7xl px-4 py-12 sm:py-16 space-y-10 sm:space-y-12">
                <UpdatePromptDialog/>

                <header className="text-center space-y-2">
                    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">Compare Internet
                        Providers</h1>
                    {!hasApiKey && (
                        <p className="text-sm text-red-400 flex items-center justify-center gap-2"><AlertCircle
                            className="size-4"/>Google Maps API Key missing. Address search is disabled.</p>)}
                    {status && <p className="text-sm text-slate-400 min-h-[20px]">{status}</p>}
                </header>

                <section className="max-w-2xl mx-auto">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                        <AddressAutocompleteInput initialValue="" onAddressSelect={handleAddressSelected}
                                                  inputClassName="bg-slate-800/50 border-slate-700 placeholder:text-slate-400 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                  containerClassName="flex-grow"/>
                        <Button onClick={connect} disabled={isSearchDisabled}
                                className={cn("bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 rounded-lg w-full sm:w-auto text-base shrink-0 h-12")}
                                size="lg">
                            {loading && !slug ? (<><Timer
                                className="animate-spin size-5 mr-2"/>Searching...</>) : loading && slug ? (<><Timer
                                className="animate-spin size-5 mr-2"/>Loading Shared...</>) : (<>
                                <SearchIcon className="size-5 mr-2"/>Search</>)}
                        </Button>
                    </div>
                </section>

                {(originalOffers.length > 0 || loading) && (<section
                    className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 md:gap-x-6 text-sm text-slate-300 border-y border-slate-700/50 py-4">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost"
                                    className="text-slate-300 hover:text-white hover:bg-slate-700/50 px-3 py-1.5"
                                    disabled={loading && processedOffers.length === 0}>
                                {SORT_OPTIONS.find(s => s.key === sortOption)?.icon && React.createElement(SORT_OPTIONS.find(s => s.key === sortOption)!.icon!, {className: "mr-2 size-4"})}
                                Sort: {SORT_OPTIONS.find(s => s.key === sortOption)?.label ?? 'Select'}
                                <ChevronDown className="ml-2 size-4"/>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-slate-800 border-slate-700 text-slate-200 w-56">
                            {SORT_OPTIONS.map(option => (
                                <DropdownMenuItem key={option.key} onClick={() => setSortOption(option.key)}
                                                  className={cn("focus:bg-slate-700 focus:text-white", sortOption === option.key && "bg-indigo-600/30 text-indigo-300")}> {option.icon &&
                                    <option.icon
                                        className="mr-2 size-4"/>} {option.label} </DropdownMenuItem>))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Popover open={filterPopoverOpen} onOpenChange={(open) => {
                        if (open) {
                            // Initialize draft filters when opening
                            setDraftFilters(filters);
                        }
                        setFilterPopoverOpen(open);
                    }}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                className="text-slate-300 hover:text-white hover:bg-slate-700/50 px-3 py-1.5 relative"
                                disabled={loading && processedOffers.length === 0}
                            >
                                <SlidersHorizontal className="mr-2 size-4"/> Filters
                                {activeFilterCount > 0 && (<Badge
                                    variant="destructive"
                                    className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center p-0.5 text-[0.6rem] leading-tight rounded-full bg-indigo-600 text-white" // Styled badge
                                >
                                    {activeFilterCount}
                                </Badge>)}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            className="w-[320px] sm:w-[340px] bg-[#1A1D2E] border-[#303558] text-slate-300 shadow-2xl p-0" // Darker theme from image
                            sideOffset={10}
                            align="end"
                        >
                            <div className="p-4 pt-5 pb-3 border-b border-[#303558]">
                                <h4 className="font-semibold text-xl text-white">Filter Offers</h4>
                            </div>
                            <ScrollArea className="">
                                <div className="p-5 space-y-6">
                                    {/* Min. Download Speed Section */}
                                    <div>
                                        <Label className="text-[0.9rem] font-medium text-slate-200 block mb-3">
                                            Min. Download Speed
                                        </Label>
                                        <div className="flex items-baseline justify-end mb-2 space-x-1">
                                            {/* Input styled to appear as plain text, no box */}
                                            <div
                                                className="bg-transparent border-none focus:ring-0 focus:outline-none p-0 h-auto text-lg font-semibold text-white w-16 text-right tabular-nums"
                                            >
                                                {draftFilters.minSpeed === 0 ? 'Any' : draftFilters.minSpeed}
                                            </div>
                                            <span className="text-sm text-slate-400">Mbps</span>
                                        </div>
                                        <Slider
                                            value={[draftFilters.minSpeed]}
                                            onValueChange={(v) => handleDraftFilterChange('minSpeed', v[0])}
                                            max={maxSpeedAvailable}
                                            step={10} // Ensure step is at least 10
                                            // Attempting to style slider track and thumb to be white
                                            // Base track: bg-slate-600 (darker than image, image is white)
                                            // Range (filled): bg-white
                                            // Thumb: bg-white, border-slate-400
                                            // These specific classes might need direct CSS for precise control over Radix parts
                                            className={cn("w-full data-[disabled=true]:opacity-50", // Custom styles for slider parts to match image (white track/thumb)
                                                // For track background (the unfilled part)
                                                "[&>span:nth-child(1)]:h-1.5 [&>span:nth-child(1)]:bg-white/30 dark:[&>span:nth-child(1)]:bg-slate-50/30", // For range (the filled part of the track)
                                                "[&>span:nth-child(1)>span]:bg-white dark:[&>span:nth-child(1)>span]:bg-slate-50",)}
                                            disabled={originalOffers.length === 0}
                                        />
                                    </div>

                                    {/* Contract Duration Section */}
                                    <div>
                                        <Label className="text-[0.9rem] font-medium text-slate-200 block mb-2">
                                            Contract Duration
                                        </Label>
                                        <ToggleGroup
                                            type="multiple"
                                            value={draftFilters.contractDurations.map(String)}
                                            onValueChange={(v) => handleDraftFilterChange('contractDurations', v.map(Number))}
                                            className="flex space-x-2.5"
                                            disabled={originalOffers.length === 0}
                                        >
                                            {(uniqueContractDurations.length > 0 ? uniqueContractDurations : AVAILABLE_CONTRACT_DURATIONS)
                                                .filter(d => [12, 24].includes(d)) // Show only 12m, 24m as per image
                                                .map(d => (<ToggleGroupItem
                                                    key={d}
                                                    value={String(d)}
                                                    className={cn("text-[0.8rem] h-8 px-3.5 rounded-md border font-medium transition-colors", "border-[#4A5568] bg-[#2D3748]/60 text-slate-300 hover:bg-[#4A5568]/70", // Default
                                                        "data-[state=on]:bg-[#4F46E5] data-[state=on]:text-white data-[state=on]:border-[#4F46E5]", // Selected (indigo-600 like)
                                                        "data-[disabled=true]:opacity-50 data-[disabled=true]:pointer-events-none")}
                                                >
                                                    {d}m
                                                </ToggleGroupItem>))}
                                        </ToggleGroup>
                                    </div>

                                    {/* Connection Type Section */}
                                    <div>
                                        <Label
                                            className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">
                                            Connection Type
                                        </Label>
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                            {AVAILABLE_CONNECTION_TYPES.map(type => (
                                                <div key={type} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`popover-conn-${type}`}
                                                        checked={draftFilters.connectionTypes.includes(type)}
                                                        onCheckedChange={(checked) => {
                                                            const newTypes = checked ? [...draftFilters.connectionTypes, type] : draftFilters.connectionTypes.filter(t => t !== type);
                                                            handleDraftFilterChange('connectionTypes', newTypes);
                                                        }}
                                                        className="size-[17px] rounded-[3px] border-[#4A5568] data-[state=checked]:bg-[#4F46E5] data-[state=checked]:text-white data-[state=checked]:border-[#4F46E5] disabled:opacity-50"
                                                        disabled={originalOffers.length === 0}
                                                    />
                                                    <Label htmlFor={`popover-conn-${type}`}
                                                           className="text-sm font-normal text-slate-200 peer-disabled:opacity-50">
                                                        {type}
                                                    </Label>
                                                </div>))}
                                        </div>
                                    </div>

                                    {/* TV Included & Youth Offer Section */}
                                    <div className="grid grid-cols-2 gap-x-6">
                                        <div>
                                            <Label
                                                className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">TV
                                                Included</Label>
                                            <RadioGroup
                                                value={draftFilters.tvIncluded}
                                                onValueChange={(value) => handleDraftFilterChange('tvIncluded', value as 'any' | 'yes' | 'no')}
                                                className="space-y-2"
                                                disabled={originalOffers.length === 0}
                                            >
                                                {(['any', 'yes', 'no'] as const).map(opt => (<div key={`tv-${opt}`}
                                                                                                  className="flex items-center space-x-2">
                                                    <RadioGroupItem
                                                        value={opt}
                                                        id={`popover-tv-${opt}`}
                                                        className="size-[17px] border-[#4A5568] data-[state=checked]:border-[#4F46E5] data-[state=checked]:text-[#4F46E5] disabled:opacity-50"
                                                    />
                                                    <Label htmlFor={`popover-tv-${opt}`}
                                                           className="text-sm font-normal text-slate-200 peer-disabled:opacity-50 capitalize">
                                                        {opt}
                                                    </Label>
                                                </div>))}
                                            </RadioGroup>
                                        </div>
                                        <div>
                                            <Label
                                                className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">Youth
                                                Offer</Label>
                                            <RadioGroup
                                                value={draftFilters.youthOffer}
                                                onValueChange={(value) => handleDraftFilterChange('youthOffer', value as 'any' | 'yes')}
                                                className="space-y-2"
                                                disabled={originalOffers.length === 0}
                                            >
                                                {(['any', 'yes'] as const).map(opt => (<div key={`youth-${opt}`}
                                                                                            className="flex items-center space-x-2">
                                                    <RadioGroupItem
                                                        value={opt}
                                                        id={`popover-youth-${opt}`}
                                                        className="size-[17px] border-[#4A5568] data-[state=checked]:border-[#4F46E5] data-[state=checked]:text-[#4F46E5] disabled:opacity-50"
                                                    />
                                                    <Label htmlFor={`popover-youth-${opt}`}
                                                           className="text-sm font-normal text-slate-200 peer-disabled:opacity-50 capitalize">
                                                        {opt}
                                                    </Label>
                                                </div>))}
                                            </RadioGroup>
                                        </div>
                                    </div>

                                    {/* Providers Section */}
                                    {(uniqueProviders.length > 0 || originalOffers.length === 0) && ( // Show even if no offers yet, but empty
                                        <div>
                                            <Label
                                                className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">
                                                Providers
                                            </Label>
                                            <ScrollArea className="max-h-36 pr-2">
                                                <div className="space-y-2">
                                                    {/* Show skeleton or actual providers */}
                                                    {originalOffers.length === 0 && loading && Array.from({length: 3}).map((_, i) => (
                                                        <div key={`skel-prov-${i}`}
                                                             className="flex items-center space-x-2">
                                                            <Skeleton
                                                                className="h-[17px] w-[17px] rounded-[3px] bg-slate-700"/>
                                                            <Skeleton className="h-4 w-28 bg-slate-700"/>
                                                        </div>))}
                                                    {uniqueProviders.map(provider => (<div key={provider}
                                                                                           className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`popover-prov-${provider}`}
                                                            checked={draftFilters.selectedProviders.includes(provider)}
                                                            onCheckedChange={(checked) => {
                                                                const newProviders = checked ? [...draftFilters.selectedProviders, provider] : draftFilters.selectedProviders.filter(p => p !== provider);
                                                                handleDraftFilterChange('selectedProviders', newProviders);
                                                            }}
                                                            className="size-[17px] rounded-[3px] border-[#4A5568] data-[state=checked]:bg-[#4F46E5] data-[state=checked]:text-white data-[state=checked]:border-[#4F46E5]"
                                                            disabled={originalOffers.length === 0 && !loading} // disable if no offers loaded and not currently loading
                                                        />
                                                        <Label htmlFor={`popover-prov-${provider}`}
                                                               className="text-sm font-normal text-slate-200">
                                                            {provider}
                                                        </Label>
                                                    </div>))}
                                                    {originalOffers.length > 0 && uniqueProviders.length === 0 && (
                                                        <p className="text-xs text-slate-500">No provider data
                                                            available.</p>)}
                                                </div>
                                            </ScrollArea>
                                        </div>)}
                                </div>
                            </ScrollArea>

                            {/* Footer */}
                            <div className="p-4 flex justify-between items-center border-t border-[#303558]">
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setDraftFilters(DEFAULT_FILTERS);
                                    }}
                                    className="text-[0.875rem] text-slate-400 hover:text-slate-100 px-3 h-9 rounded-md"
                                    disabled={activeFilterCount === 0 && filters.minSpeed === 0} // Disable if no filters are set
                                >
                                    <XIcon className="mr-1.5 size-4"/> Reset All
                                </Button>
                                <Button
                                    onClick={() => {
                                        setFilters(draftFilters);
                                        setFilterPopoverOpen(false);
                                    }}
                                    className="bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[0.875rem] font-medium px-5 h-9 rounded-md" // Indigo-600 like color
                                >
                                    Done
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Share Button */}
                    <Button variant="ghost"
                            className="text-slate-300 hover:text-white hover:bg-slate-700/50 px-3 py-1.5"
                            onClick={handleShare}
                            disabled={!slug || (loading && !processedOffers.length) || sharedLinkCopied}>
                        <Share2 className="mr-2 size-4"/>
                        {sharedLinkCopied ? 'Copied!' : 'Share'}
                    </Button>
                    <div className="flex items-center gap-2">
                        <span className="text-slate-400">View:</span>
                        <ToggleGroup type="single" value={viewMode} onValueChange={(v) => {
                            if (v) setViewMode(v as any);
                        }} className="bg-slate-800/60 rounded-md p-0.5"
                                     disabled={loading && processedOffers.length === 0}>
                            <ToggleGroupItem value="grid" aria-label="Grid view"
                                             className="data-[state=on]:bg-indigo-600 data-[state=on]:text-white text-slate-400 hover:text-white px-2.5 py-1"><LayoutGrid
                                className="size-4"/></ToggleGroupItem>
                            <ToggleGroupItem value="list" aria-label="List view"
                                             className="data-[state=on]:bg-indigo-600 data-[state=on]:text-white text-slate-400 hover:text-white px-2.5 py-1"><List
                                className="size-4"/></ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                </section>)}

                <section>
                    {loading && processedOffers.length === 0 && (<div
                        className={cn("grid gap-6", viewMode === 'grid' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3" : "grid-cols-1")}>{Array.from({length: viewMode === 'grid' ? 6 : 3}).map((_, i) => (
                        <Skeleton key={i} className="h-96 w-full rounded-xl bg-slate-700/50"/>))}</div>)}
                    {!loading && processedOffers.length === 0 && originalOffers.length > 0 && (
                        <div className="text-center py-10"><SlidersHorizontal
                            className="mx-auto size-16 text-slate-500 mb-4"/><p
                            className="text-slate-400 text-lg">No offers match your current filters.</p><p
                            className="text-slate-500 text-sm">Try adjusting your filter criteria
                            or <Button // Corrected: Should call resetAllFilters from state setter, not component level
                                variant="link" className="text-indigo-400 px-1" onClick={() => {
                                resetAllFilters();
                                setFilterPopoverOpen(true);
                            }}>reset all filters</Button>.</p></div>)}
                    {!loading && originalOffers.length === 0 && status && !status.toLowerCase().includes('error') && !status.toLowerCase().includes('connecting') && !status.toLowerCase().includes('refining') && !status.toLowerCase().includes('initial offers') && (
                        <div className="text-center py-10"><Wifi className="mx-auto size-16 text-slate-500 mb-4"/><p
                            className="text-slate-400 text-lg">No offers found for this address.</p><p
                            className="text-slate-500 text-sm">Please ensure the address is correct and try
                            again.</p></div>)} {/* Add condition for isLoadingFromSlug */}
                    {processedOffers.length > 0 && (<ScrollArea
                        className={cn("overflow-y-auto", "max-h-[calc(100vh-450px)] sm:max-h-[calc(100vh-420px)]")}><AnimatePresence
                        mode="popLayout">
                        <div
                            className={cn("grid gap-5 sm:gap-6 p-1", viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1 md:grid-cols-2 gap-4")}>
                            {processedOffers.map((o) => (<OfferCard key={`${o.provider}-${o.product_id}`} offer={o}
                                                                    currentSortOption={sortOption}/>))}
                        </div>
                    </AnimatePresence></ScrollArea>)}
                </section>
            </main>
        </div>
    </>);
}