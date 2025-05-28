/**
 * @module useAddressAutocomplete
 * @description Provides address autocomplete and geocoding functionality using the Google Places SDK.
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import usePlacesAutocomplete, { getGeocode } from "use-places-autocomplete";
import { parseGeocodeResult } from "@/utils/address"; // Assuming this parses google.maps.GeocoderResult[]
import type { Address } from "@/types/address";

/**
 * API exposed by the address autocomplete hook.
 */
export interface UseAddressAutocomplete {
    /** Current input value */
    value: string;
    /** Update input; fetch suggestions if true */
    setValue: (val: string, shouldFetchSuggestions?: boolean) => void;
    /** Autocomplete suggestions from Google Places */
    suggestions: ReturnType<typeof usePlacesAutocomplete>["suggestions"];
    /** Handles suggestion selection: geocode, update input, invoke callback */
    handleSelect: (description: string) => Promise<void>;
    /** Geocodes arbitrary address and emits result without changing input */
    geocodeAndEmit: (addr: string) => Promise<void>;
    /** True when hook and SDK are initialized */
    ready: boolean;
}

interface Params {
    /** Callback when parsing finishes (null → invalid). Receives parsed address and full formatted string. */
    onAddressSelectAction: (
        addr: Address | null,
        fullFormattedString: string,
    ) => void;
    /** Optional initial input value. */
    initialValue?: string;
}

/**
 * Manages address autocomplete input.
 *
 * @param onAddressSelectAction Callback with parsed Address or null and formatted address
 * @param initialValue Optional initial input value
 * @returns UseAddressAutocomplete API
 */
export const useAddressAutocomplete = ({
    onAddressSelectAction,
    initialValue = "",
}: Params): UseAddressAutocomplete => {
    const {
        ready: hookReady, // Renamed to avoid conflict with outer `ready` state
        value,
        suggestions,
        setValue, // This is from `usePlacesAutocomplete`
        clearSuggestions,
        init,
    } = usePlacesAutocomplete({
        initOnMount: false, // Initialize manually after SDK check
        requestOptions: { componentRestrictions: { country: "de" } }, // Restrict to Germany
        debounce: 400, // Debounce API calls
    });

    const [sdkReady, setSdkReady] = useState(false);
    const triedInit = useRef(false);

    // Initializes the Google Places SDK when available
    useEffect(() => {
        if (triedInit.current || typeof window === "undefined") return;

        const pollForGoogleSDK = () => {
            if (window.google?.maps?.places) {
                // Initialize the usePlacesAutocomplete hook
                init(); // Initialize `usePlacesAutocomplete`
                setSdkReady(true);
                triedInit.current = true;
            } else {
                // Retry initialization after a brief delay
                setTimeout(pollForGoogleSDK, 100); // Check again shortly
            }
        };
        pollForGoogleSDK();
    }, [init]);

    // Populate initial input value without triggering suggestion fetch
    useEffect(() => {
        if (initialValue) {
            setValue(initialValue, false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Restrict effect to initialValue changes only
    }, [initialValue /* setValue is stable */]);

    /**
     * Handles selection of an autocomplete suggestion by performing geocoding,
     * updating the input value, and invoking the provided callback.
     */
    const handleSelect = useCallback(
        async (description: string) => {
            clearSuggestions(); // Clear existing suggestions to close the dropdown

            // If SDK or autocomplete hook is not initialized, use fallback behavior
            if (!hookReady || !sdkReady) {
                setValue(description, false); // Update input with the selected description
                onAddressSelectAction(null, description); // Invoke callback with the raw description
                // Log a warning if SDK is unavailable during selection
                console.warn(
                    "[AddressAutocomplete] SDK not ready during handleSelect. Using raw description.",
                );
                return;
            }

            try {
                // Perform geocoding for the selected place description
                const geocodeResults = await getGeocode({
                    address: description,
                });

                if (geocodeResults && geocodeResults.length > 0) {
                    // Process successful geocoding response
                    const bestResult = geocodeResults[0]; // Use the first result as the most relevant match
                    // Extract the fully formatted address returned by the API
                    const fullFormattedAddress = bestResult.formatted_address;
                    // Parse geocoding results into the Address model using the utility function
                    const parsedAddressData =
                        parseGeocodeResult(geocodeResults);

                    // Update input value with the formatted address
                    setValue(fullFormattedAddress, false);

                    // Invoke callback with structured address data and formatted address
                    onAddressSelectAction(
                        parsedAddressData,
                        fullFormattedAddress,
                    );
                } else {
                    // If geocoding returns no results, use the original description as fallback
                    console.warn(
                        `[AddressAutocomplete] Geocoding for "${description}" returned no results. Using description as fallback.`,
                    );
                    setValue(description, false);
                    onAddressSelectAction(null, description);
                }
            } catch (error: unknown) {
                // Handle potential errors during the geocoding process
                console.error(
                    `[AddressAutocomplete] Geocoding failed for "${description}":`,
                    error,
                );
                // On error, revert to using the original description
                setValue(description, false);
                onAddressSelectAction(null, description);
            }
        },
        [
            hookReady,
            sdkReady,
            setValue,
            clearSuggestions,
            onAddressSelectAction /* parseGeocodeResult is a stable import */,
        ],
    );

    /**
     * Geocodes a free-form address string and invokes the callback without modifying the input value.
     */
    const geocodeAndEmit = useCallback(
        async (addressString: string) => {
            const trimmedAddress = addressString.trim();
            if (!trimmedAddress) {
                onAddressSelectAction(null, ""); // Empty input, clear address
                return;
            }

            if (!hookReady || !sdkReady) {
                // If SDK is not ready, invoke callback with the raw address input
                console.warn(
                    "[AddressAutocomplete] SDK not ready during geocodeAndEmit. Emitting raw address.",
                );
                onAddressSelectAction(null, trimmedAddress);
                return;
            }

            try {
                const results = await getGeocode({ address: trimmedAddress });
                const parsed = parseGeocodeResult(results);
                // Pass formatted address to callback without modifying the input value
                onAddressSelectAction(
                    parsed,
                    results[0]?.formatted_address ?? trimmedAddress, // Prefer formatted, fallback to input
                );
            } catch (err: unknown) {
                console.error(
                    `[AddressAutocomplete] Geocoding failed for "${trimmedAddress}":`,
                    err,
                );
                // Invoke callback with raw input on error
                onAddressSelectAction(null, trimmedAddress); // Emit raw input on error
            }
        },
        [hookReady, sdkReady, onAddressSelectAction],
    );

    return {
        value,
        setValue,
        suggestions,
        handleSelect, // Selection handler for autocomplete suggestions
        geocodeAndEmit,
        ready: sdkReady && hookReady, // Indicates if both SDK and hook are initialized
    };
};
