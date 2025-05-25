/**
 * Custom React hook providing address autocomplete and geocoding capabilities.
 * Utilizes Google Places SDK for suggestions and geocoding.
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import usePlacesAutocomplete, { getGeocode } from "use-places-autocomplete";
import { parseGeocodeResult } from "@/utils/address";
import type { Address } from "@/types/address";

/**
 * Hook return API.
 *
 * @property value - Current input value.
 * @property setValue - Updates input value; fetches suggestions if indicated.
 * @property suggestions - Array of place suggestions.
 * @property handleSelect - Handles selection of a suggestion.
 * @property geocodeAndEmit - Geocodes input string and emits parsed address.
 * @property ready - Indicates when the SDK and hook are fully initialized.
 */
export interface UseAddressAutocomplete {
    /** Controlled input value. */
    value: string;
    /** Update value (triggers suggestions). */
    setValue: (val: string, shouldFetchSuggestions?: boolean) => void;
    /** Suggestions returned by Google Places. */
    suggestions: ReturnType<typeof usePlacesAutocomplete>["suggestions"];
    /** Call when user picks or submits an address. */
    handleSelect: (desc: string) => Promise<void>;
    /** Geocode an arbitrary string & emit result. */
    geocodeAndEmit: (addr: string) => Promise<void>;
    /** `true` once the SDK and hook are ready. */
    ready: boolean;
}

interface Params {
    /** Callback when parsing finishes (null → invalid). */
    onAddressSelectAction: (addr: Address | null, full: string) => void;
    /** Optional initial input value. */
    initialValue?: string;
}

/**
 * Custom React hook for address autocomplete and geocoding.
 *
 * @param onAddressSelect - Called with parsed Address or null and full string.
 * @param initialValue - Optional starting value for the input.
 * @returns UseAddressAutocomplete API for managing the autocomplete flow.
 */
export const useAddressAutocomplete = ({
    onAddressSelectAction,
    initialValue = "",
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
        requestOptions: { componentRestrictions: { country: "de" } },
        debounce: 400,
    });

    /** Wait for the global Google SDK then run `init()` once. */
    const [sdkReady, setSdkReady] = useState(false);
    const triedInit = useRef(false);

    useEffect(() => {
        // Poll for the Google Maps Places SDK to be available before initializing.
        if (triedInit.current) return;
        const poll = () => {
            if (window.google?.maps?.places) {
                init();
                setSdkReady(true);
                triedInit.current = true;
            } else {
                setTimeout(poll, 100);
            }
        };
        poll();
    }, [init]);

    /**
     * Geocodes a free-form address string and invokes the onAddressSelect callback.
     *
     * @param addr - Address string to geocode.
     */
    const geocodeAndEmit = useCallback(
        async (addr: string) => {
            const trimmed = addr.trim();
            if (!trimmed) return onAddressSelectAction(null, "");

            if (!hookReady) {
                // SDK not ready – emit raw value only
                return onAddressSelectAction(null, trimmed);
            }

            try {
                const results = await getGeocode({ address: trimmed });
                const parsed = parseGeocodeResult(results);
                onAddressSelectAction(
                    parsed,
                    results[0]?.formatted_address ?? trimmed,
                );
            } catch (err: unknown) {
                console.error("[AddressAutocomplete] Geocoding failed:", err);
                onAddressSelectAction(null, trimmed);
            }
        },
        [hookReady, onAddressSelectAction],
    );

    /**
     * Processes a selected suggestion: updates input, clears suggestions, and geocodes.
     *
     * @param desc - Description of the selected place.
     */
    const handleSelect = useCallback(
        async (desc: string) => {
            setValue(desc, false);
            clearSuggestions();
            await geocodeAndEmit(desc);
        },
        [setValue, clearSuggestions, geocodeAndEmit],
    );

    /**
     * Initializes input value on mount without fetching suggestions.
     */
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
