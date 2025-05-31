"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import usePlacesAutocomplete, { getGeocode } from "use-places-autocomplete";
import { parseGeocodeResult } from "@/utils/address";
import type { Address } from "@/types/address";
import { logger } from "@/utils/logger";

/**
 * @interface UseAddressAutocomplete
 *
 * Hook API for address autocomplete functionality.
 *
 * @property {string} value - Current input value.
 * @property {(val: string, shouldFetchSuggestions?: boolean) => void} setValue - Updates the input and optionally fetches suggestions.
 * @property {ReturnType<typeof usePlacesAutocomplete>["suggestions"]} suggestions - Autocomplete suggestions from Google Places.
 * @property {(description: string) => Promise<Address | null>} handleSelect - Processes a selected suggestion: clears suggestions, geocodes it, updates input, emits result, and returns parsed Address or null.
 * @property {(addr: string) => Promise<Address | null>} geocodeAndEmit - Geocodes any address string without modifying input value, emits result, and returns parsed Address or null.
 * @property {boolean} ready - True when both the hook and Google SDK are initialized.
 */
export interface UseAddressAutocomplete {
    /** Current input value */
    value: string;
    /** Update input; fetch suggestions if true */
    setValue: (val: string, shouldFetchSuggestions?: boolean) => void;
    /** Autocomplete suggestions from Google Places */
    suggestions: ReturnType<typeof usePlacesAutocomplete>["suggestions"];
    /**
     * Handles suggestion selection: geocodes, updates input, invokes callback, and returns parsed address.
     * @param description The selected place description.
     * @returns A promise that resolves to the parsed Address object or null if parsing fails.
     */
    handleSelect: (description: string) => Promise<Address | null>;
    /**
     * Geocodes an arbitrary address string, invokes callback, and returns parsed address.
     * Does not change the input value directly.
     * @param addr The address string to geocode.
     * @returns A promise that resolves to the parsed Address object or null if parsing fails.
     */
    geocodeAndEmit: (addr: string) => Promise<Address | null>;
    /** True when hook and SDK are initialized */
    ready: boolean;
}

/**
 * @interface Params
 *
 * Parameters for the useAddressAutocomplete hook.
 *
 * @property {(addr: Address | null, fullFormattedString: string) => void} onAddressSelectAction - Callback invoked when geocoding or selection completes. Receives parsed Address or null if invalid, and the full formatted address string.
 * @property {string} [initialValue] - Optional initial value for the input field.
 */
interface Params {
    onAddressSelectAction: (
        addr: Address | null,
        fullFormattedString: string,
    ) => void;
    initialValue?: string;
}

/**
 * Manages address autocomplete input state, suggestions, and geocoding.
 *
 * Initializes the Google Places Autocomplete SDK, maintains input value and suggestions,
 * and provides handlers to process user selections and arbitrary geocoding.
 *
 * @param params - Hook parameters.
 * @param params.onAddressSelectAction - Callback for parsed Address or null with formatted string.
 * @param params.initialValue - Optional initial input value.
 * @returns {UseAddressAutocomplete} The hook API with current value, handlers, and readiness flag.
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

    const [sdkReady, setSdkReady] = useState(false);
    const triedInit = useRef(false);

    useEffect(() => {
        if (triedInit.current || typeof window === "undefined") return;
        const pollForGoogleSDK = () => {
            if (window.google?.maps?.places) {
                init();
                setSdkReady(true);
                triedInit.current = true;
            } else {
                setTimeout(pollForGoogleSDK, 100);
            }
        };
        pollForGoogleSDK();
    }, [init]);

    useEffect(() => {
        if (initialValue) {
            setValue(initialValue, false);
        }
    }, [initialValue, setValue]);

    /**
     * Processes a selected suggestion from autocomplete.
     *
     * Performs geocoding on the selected description, updates the input value,
     * emits the result via the provided callback, and returns the parsed Address or null.
     *
     * @param description - The place description selected by the user.
     * @returns Promise resolving to the parsed Address object if successful, or null otherwise.
     *
     * @remarks
     * Clears existing suggestions before geocoding. If the hook is not ready, emits null.
     *
     */
    const handleSelect = useCallback(
        async (description: string): Promise<Address | null> => {
            clearSuggestions(); // We’ll update UI after the real geocode

            if (!hookReady) {
                onAddressSelectAction(null, description);
                return null;
            }

            try {
                const results = await getGeocode({ address: description });

                if (results.length) {
                    const formatted = results[0].formatted_address;
                    const parsed = parseGeocodeResult(results);

                    setValue(formatted, false);
                    onAddressSelectAction(parsed, formatted);
                    return parsed;
                }

                // fallback – no results
                setValue(description, false);
                onAddressSelectAction(null, description);
                return null;
            } catch (err) {
                logger.error(
                    "AddressAutocomplete",
                    "Geocode failed during selection",
                    err,
                );
                onAddressSelectAction(null, description);
                return null;
            }
        },
        [hookReady, setValue, clearSuggestions, onAddressSelectAction],
    );

    /**
     * Geocodes an arbitrary address string without modifying input value.
     *
     * Trims whitespace, then if SDK and hook are ready, performs geocoding,
     * invokes callback with parsed Address and formatted string, and returns parsed Address.
     *
     * @param addressString - The address string to geocode.
     * @returns Promise resolving to the parsed Address object if geocoding succeeds, or null otherwise.
     *
     * @remarks
     * Emits null for empty input. Warns and emits raw address if SDK or hook not ready.
     *
     */
    const geocodeAndEmit = useCallback(
        async (addressString: string): Promise<Address | null> => {
            const trimmedAddress = addressString.trim();
            if (!trimmedAddress) {
                onAddressSelectAction(null, "");
                return null;
            }

            if (!hookReady || !sdkReady) {
                logger.warn(
                    "AddressAutocomplete",
                    "SDK not ready during geocodeAndEmit. Emitting raw address.",
                );
                onAddressSelectAction(null, trimmedAddress);
                return null;
            }

            try {
                const results = await getGeocode({ address: trimmedAddress });
                const parsed = parseGeocodeResult(results);
                const formatted =
                    results[0]?.formatted_address ?? trimmedAddress;
                onAddressSelectAction(parsed, formatted);
                return parsed;
            } catch (err: unknown) {
                logger.error(
                    "AddressAutocomplete",
                    `Geocoding failed for "${trimmedAddress}"`,
                    err,
                );
                onAddressSelectAction(null, trimmedAddress);
                return null;
            }
        },
        [hookReady, sdkReady, onAddressSelectAction],
    );

    return {
        value,
        setValue,
        suggestions,
        handleSelect,
        geocodeAndEmit,
        ready: hookReady,
    };
};
