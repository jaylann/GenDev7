'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import usePlacesAutocomplete, { getGeocode } from 'use-places-autocomplete';
import { parseGeocodeResult } from '@/utils/address';
import type { Address } from '@/types/address';

/** The public shape returned by the custom hook. */
export interface UseAddressAutocomplete {
    /** Controlled input value. */
    value: string;
    /** Update value (triggers suggestions). */
    setValue: (val: string, shouldFetchSuggestions?: boolean) => void;
    /** Suggestions returned by Google Places. */
    suggestions: ReturnType<typeof usePlacesAutocomplete>['suggestions'];
    /** Call when user picks or submits an address. */
    handleSelect: (desc: string) => Promise<void>;
    /** Geocode an arbitrary string & emit result. */
    geocodeAndEmit: (addr: string) => Promise<void>;
    /** `true` once the SDK and hook are ready. */
    ready: boolean;
}

interface Params {
    /** Callback when parsing finishes (null → invalid). */
    onAddressSelect: (addr: Address | null, full: string) => void;
    /** Optional initial input value. */
    initialValue?: string;
}

export const useAddressAutocomplete = ({
                                           onAddressSelect,
                                           initialValue = '',
                                       }: Params): UseAddressAutocomplete => {
    const {
        ready: hookReady,
        value,
        suggestions,
        setValue,
        clearSuggestions,
        init,
    } = usePlacesAutocomplete({
        initOnMount: false,
        requestOptions: { componentRestrictions: { country: 'de' } },
        debounce: 400,
    });

    /** Wait for the global Google SDK then run `init()` once. */
    const [sdkReady, setSdkReady] = useState(false);
    const triedInit = useRef(false);

    useEffect(() => {
        if (triedInit.current) return;
        const poll = () => {
            if ((window as any).google?.maps?.places) {
                init();
                setSdkReady(true);
                triedInit.current = true;
            } else {
                setTimeout(poll, 100);
            }
        };
        poll();
    }, [init]);

    /** Submit, geocode, emit parsed value. */
    const geocodeAndEmit = useCallback(
        async (addr: string) => {
            const trimmed = addr.trim();
            if (!trimmed) return onAddressSelect(null, '');

            if (!hookReady) {
                // SDK not ready – emit raw value only
                return onAddressSelect(null, trimmed);
            }

            try {
                const results = await getGeocode({ address: trimmed });
                const parsed = parseGeocodeResult(results);
                onAddressSelect(parsed, results[0]?.formatted_address ?? trimmed);
            } catch (err) {
                console.error('[AddressAutocomplete] Geocoding failed:', err);
                onAddressSelect(null, trimmed);
            }
        },
        [hookReady, onAddressSelect],
    );

    /** When user picks a suggestion row. */
    const handleSelect = useCallback(
        async (desc: string) => {
            setValue(desc, false);
            clearSuggestions();
            await geocodeAndEmit(desc);
        },
        [setValue, clearSuggestions, geocodeAndEmit],
    );

    /** One-time initial value. */
    useEffect(() => {
        if (initialValue) setValue(initialValue, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        value,
        setValue,
        suggestions,
        handleSelect,
        geocodeAndEmit,
        ready: sdkReady && hookReady,
    };
};
