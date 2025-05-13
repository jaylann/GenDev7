// components/address-autocomplete-input.tsx
'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import usePlacesAutocomplete, { getGeocode } from 'use-places-autocomplete';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// -----------------------------------------------------------------------------
// Environment guard
// -----------------------------------------------------------------------------
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!apiKey) {
    console.error('❌ PRE-CHECK: Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY – check .env.local. Autocomplete will be disabled.');
}

// -----------------------------------------------------------------------------
// Google Maps loader
// -----------------------------------------------------------------------------
export const GoogleMapsLoader: React.FC = () => {
    if (!apiKey) {
        console.warn("GoogleMapsLoader: API key missing, Google Maps script not loaded.");
        return null; // Don't render script tag if no API key
    }
    return (
        <Script
            id="google-maps-sdk"
            src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`}
            strategy="afterInteractive"
            async
            onLoad={() => console.log('Google Maps SDK loaded successfully via <Script>.')}
            onError={(e) => console.error('Failed to load Google Maps SDK via <Script>:', e)}
        />
    );
};

// -----------------------------------------------------------------------------
// Domain types
// -----------------------------------------------------------------------------
export interface ParsedAddress {
    street: string;
    house_number: string;
    city: string;
    plz: string;
    country_code: 'DE';
}

export interface AddressAutocompleteInputProps {
    initialValue?: string; // Making initialValue truly optional
    onAddressSelect: (address: ParsedAddress | null, fullAddressText: string) => void;
    inputClassName?: string;
    containerClassName?: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const extractAddressComponent = (
    comps: google.maps.GeocoderAddressComponent[],
    type: string,
    short = false,
): string | undefined =>
    comps.find((c) => c.types.includes(type))?.[short ? 'short_name' : 'long_name'];

const parseGeocodeResult = (results: google.maps.GeocoderResult[]): ParsedAddress | null => {
    if (!results.length) {
        console.debug('[ParseGeocode] No results');
        return null;
    }
    const [r] = results;
    if (!r.address_components) {
        console.debug('[ParseGeocode] No address_components in result:', r);
        return null;
    }

    const c = r.address_components;
    const country = extractAddressComponent(c, 'country', true);
    if (country !== 'DE') {
        console.debug(`[ParseGeocode] Country not DE: ${country}. Full address: ${r.formatted_address}`);
        return null;
    }

    const street = extractAddressComponent(c, 'route');
    const house  = extractAddressComponent(c, 'street_number');
    const city   =
        extractAddressComponent(c, 'locality') ??
        extractAddressComponent(c, 'postal_town') ??
        extractAddressComponent(c, 'administrative_area_level_3') ??
        extractAddressComponent(c, 'sublocality_level_1');
    const plz    = extractAddressComponent(c, 'postal_code');

    if (!street || !house || !city || !plz || !/^\d{5}$/.test(plz)) {
        console.warn('[ParseGeocode] Validation failed for a DE address:', { street, house, city, plz, formatted: r.formatted_address });
        return null;
    }
    return { street, house_number: house, city, plz, country_code: 'DE' } as const;
};

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export const AddressAutocompleteInput: React.FC<AddressAutocompleteInputProps> = ({
                                                                                      initialValue, // Keep it potentially undefined
                                                                                      onAddressSelect,
                                                                                      inputClassName,
                                                                                      containerClassName,
                                                                                  }) => {
    const {
        ready,
        value, // This value from the hook should always be a string
        suggestions: { status, data, loading: suggestionsLoading },
        setValue,
        clearSuggestions,
        init,
    } = usePlacesAutocomplete({
        initOnMount: false,
        requestOptions: { componentRestrictions: { country: 'de' } },
        debounce: 400,
    });

    const [sdkReady, setSdkReady] = useState(false);
    const [isManuallyInitialized, setIsManuallyInitialized] = useState(false); // Track manual init call

    // Wait for SDK loop and initialize
    useEffect(() => {
        if (!apiKey || isManuallyInitialized) return; // Don't run if no key or already tried to init

        let cancelled = false;
        const attemptInitialization = () => {
            if (cancelled) return;
            if ((window as any).google?.maps?.places) {
                console.log('Google Maps Places SDK is available. Initializing usePlacesAutocomplete.');
                try {
                    init(); // Initialize the hook
                    setSdkReady(true);
                } catch (error) {
                    console.error("Error calling usePlacesAutocomplete init():", error);
                }
                setIsManuallyInitialized(true); // Mark that we've called init
            } else {
                console.debug('Waiting for Google Maps Places SDK...');
                setTimeout(attemptInitialization, 100);
            }
        };
        attemptInitialization();
        return () => { cancelled = true; };
    }, [init, isManuallyInitialized]); // Removed apiKey from deps, it's module-level

    // Pre-fill and ensure `value` is controlled
    useEffect(() => {
        // `ready` from the hook indicates init() has run and hook is functional.
        // `sdkReady` indicates the Google script is loaded.
        // Both should be true.
        if (ready && sdkReady) {
            // Only set initialValue if the current `value` from the hook is empty
            // and initialValue is provided. This prevents overwriting user input
            // or a value set by suggestion selection.
            if (initialValue !== undefined && value === "") {
                setValue(initialValue, false);
            } else if (value === undefined) {
                // This case should ideally not happen if usePlacesAutocomplete works correctly.
                // Forcing it to be an empty string if it ever becomes undefined.
                setValue("", false);
            }
        }
    }, [ready, sdkReady, initialValue, setValue, value]);


    const geocodeAndEmit = useCallback(
        async (addr: string) => {
            const trimmedAddr = addr.trim();
            if (!trimmedAddr) {
                onAddressSelect(null, '');
                return;
            }
            // `ready` implies Google Maps API is loaded and `init()` was successful for the hook.
            if (!ready) {
                console.warn('[AddressAutocomplete] Geocoding attempted before usePlacesAutocomplete is ready (hook.ready is false).');
                onAddressSelect(null, trimmedAddr);
                return;
            }
            try {
                const results = await getGeocode({ address: trimmedAddr });
                const parsed = parseGeocodeResult(results);
                onAddressSelect(parsed, results[0]?.formatted_address ?? trimmedAddr);
            } catch (err) {
                console.error('[AddressAutocomplete] Geocoding API call failed:', err);
                onAddressSelect(null, trimmedAddr);
            }
        },
        [onAddressSelect, ready],
    );

    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setValue(newValue); // This should always pass a string
        setShowSuggestions(true);
        if (!newValue.trim()) {
            onAddressSelect(null, '');
            // clearSuggestions(); // Optional: clear suggestions when input is empty
        }
    };

    const handleSelect = async (desc: string) => {
        setValue(desc, false);
        setShowSuggestions(false);
        // clearSuggestions(); // setValue(desc, false) usually clears them if it's a selection
        await geocodeAndEmit(desc);
        // inputRef.current?.focus(); // Optional
    };

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (showSuggestions && status === 'OK' && data.length > 0) {
                await handleSelect(data[0].description);
            } else if (value.trim()) {
                setShowSuggestions(false);
                await geocodeAndEmit(value);
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
            // clearSuggestions(); // Optional
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                inputRef.current && !inputRef.current.contains(event.target as Node) &&
                listRef.current && !listRef.current.contains(event.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!apiKey) { // If no API key, render a disabled state.
        return (
            <div className={cn('relative w-full', containerClassName)}>
                <Input
                    type="text"
                    placeholder="Address service disabled (No API Key)"
                    className={cn("h-12 text-red-400 placeholder:text-red-700/80 bg-red-900/30 border-red-700", inputClassName)}
                    disabled
                />
            </div>
        );
    }

    if (!sdkReady || !ready) { // Combined check: SDK must be loaded AND hook initialized.
        return (
            <div className={cn('relative w-full', containerClassName)}>
                <Input
                    type="text"
                    placeholder="Loading address service..."
                    className={cn("h-12", inputClassName)}
                    disabled
                    value={initialValue || ""} // Ensure value is defined
                />
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-5 animate-spin text-slate-400" />
            </div>
        );
    }

    // At this point, sdkReady and ready (hook's ready) are true.
    // The `value` from usePlacesAutocomplete should be a defined string.
    return (
        <div className={cn('relative w-full', containerClassName)}>
            <Input
                ref={inputRef}
                type="text"
                value={value || ""} // Ensure value is always a string for controlled input
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => { if (value.trim()) setShowSuggestions(true);}}
                placeholder="Street 123, 12345 City"
                className={cn("h-12", inputClassName)}
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={showSuggestions && status === 'OK' && data.length > 0}
                // disabled={!ready} // Already handled by the loading state above
            />

            {suggestionsLoading && ( // Show loader only when actively fetching suggestions
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-slate-400" />
            )}

            {showSuggestions && status === 'OK' && data.length > 0 && (
                <ul ref={listRef} className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-700 bg-slate-800/95 backdrop-blur-sm shadow-lg" role="listbox">
                    {data.map(({ place_id, description, structured_formatting }) => (
                        <li key={place_id} onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelect(description)} className="cursor-pointer px-4 py-2.5 text-sm text-slate-200 hover:bg-indigo-600 hover:text-white" role="option" aria-selected={false}>
                            <strong>{structured_formatting.main_text}</strong> <small className="text-slate-400">{structured_formatting.secondary_text}</small>
                        </li>
                    ))}
                </ul>
            )}

            {/* Specific status messages, shown only when suggestions are meant to be visible and relevant status occurs */}
            {showSuggestions && value.trim() && !suggestionsLoading && (
                <>
                    {status === 'ZERO_RESULTS' && (
                        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-400 shadow-lg">
                            No matching addresses found.
                        </div>
                    )}
                    {status === 'REQUEST_DENIED' && (
                        <div className="absolute z-20 mt-1 w-full rounded-md border border-red-700 bg-red-900/50 px-3 py-2 text-sm text-red-400 shadow-lg">
                            Autocomplete error: REQUEST_DENIED (check API key & quotas).
                        </div>
                    )}
                    {/* Catch other non-OK, non-ZERO_RESULTS, non-REQUEST_DENIED statuses that indicate an issue */}
                    {status && status !== 'OK' && status !== 'ZERO_RESULTS' && status !== 'REQUEST_DENIED' && (
                        <div className="absolute z-20 mt-1 w-full rounded-md border border-orange-600 bg-orange-900/50 px-3 py-2 text-sm text-orange-300 shadow-lg">
                            Autocomplete status: {status}. If persists, check console.
                        </div>
                    )}
                </>
            )}
        </div>
    );
};