/**
 * @module useAddressAutocomplete
 * @description Address autocomplete and geocoding via Google Places SDK.
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

    // Initialize Places SDK when available
    useEffect(() => {
        if (triedInit.current || typeof window === "undefined") return;

        const pollForGoogleSDK = () => {
            if (window.google?.maps?.places) {
                init(); // Initialize `usePlacesAutocomplete`
                setSdkReady(true);
                triedInit.current = true;
            } else {
                setTimeout(pollForGoogleSDK, 100); // Check again shortly
            }
        };
        pollForGoogleSDK();
    }, [init]);

    // Set initial input value without fetching suggestions
    useEffect(() => {
        if (initialValue) {
            setValue(initialValue, false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Only on initialValue change or mount
    }, [initialValue /* setValue is stable */]);

    /**
     * Handles selection of a suggestion: geocodes, updates input, and invokes callback.
     */
    const handleSelect = useCallback(
        async (description: string) => {
            clearSuggestions(); // Hide the suggestions dropdown immediately

            // If the Places API hook isn't ready, fallback to a simpler behavior.
            if (!hookReady || !sdkReady) {
                setValue(description, false); // Set input to the selected description
                onAddressSelectAction(null, description); // Notify parent
                console.warn(
                    "[AddressAutocomplete] SDK not ready during handleSelect. Using raw description.",
                );
                return;
            }

            try {
                // Geocode the textual description of the selected place.
                const geocodeResults = await getGeocode({
                    address: description,
                });

                if (geocodeResults && geocodeResults.length > 0) {
                    // Successfully geocoded.
                    const bestResult = geocodeResults[0]; // Typically, the first result is the most relevant.
                    // This is the full, canonical address string from Google, e.g., "Am Brunnen 24, 85551 Kirchheim bei München, Germany"
                    const fullFormattedAddress = bestResult.formatted_address;
                    // Use your utility function to parse Google's GeocoderResult[] into your app's Address structure.
                    const parsedAddressData =
                        parseGeocodeResult(geocodeResults);

                    // KEY CHANGE: Update the input field to display the full, formatted address.
                    setValue(fullFormattedAddress, false);

                    // Notify the parent component about the selection, providing both the
                    // structured address object and the full formatted string.
                    onAddressSelectAction(
                        parsedAddressData,
                        fullFormattedAddress,
                    );
                } else {
                    // Geocoding returned no results. Fallback to using the original description.
                    console.warn(
                        `[AddressAutocomplete] Geocoding for "${description}" returned no results. Using description as fallback.`,
                    );
                    setValue(description, false);
                    onAddressSelectAction(null, description);
                }
            } catch (error: unknown) {
                // Handle any errors that occur during the geocoding process.
                console.error(
                    `[AddressAutocomplete] Geocoding failed for "${description}":`,
                    error,
                );
                // In case of an error, fallback to using the original description in the input field.
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
     * Geocodes a free-form address string and invokes callback without changing input.
     */
    const geocodeAndEmit = useCallback(
        async (addressString: string) => {
            const trimmedAddress = addressString.trim();
            if (!trimmedAddress) {
                onAddressSelectAction(null, ""); // Empty input, clear address
                return;
            }

            if (!hookReady || !sdkReady) {
                // SDK not ready – emit raw value only
                console.warn(
                    "[AddressAutocomplete] SDK not ready during geocodeAndEmit. Emitting raw address.",
                );
                onAddressSelectAction(null, trimmedAddress);
                return;
            }

            try {
                const results = await getGeocode({ address: trimmedAddress });
                const parsed = parseGeocodeResult(results);
                // The formatted_address from geocoding is passed to onAddressSelectAction.
                // The input field's value is *not* changed here.
                onAddressSelectAction(
                    parsed,
                    results[0]?.formatted_address ?? trimmedAddress, // Prefer formatted, fallback to input
                );
            } catch (err: unknown) {
                console.error(
                    `[AddressAutocomplete] Geocoding failed for "${trimmedAddress}":`,
                    err,
                );
                onAddressSelectAction(null, trimmedAddress); // Emit raw input on error
            }
        },
        [hookReady, sdkReady, onAddressSelectAction],
    );

    return {
        value,
        setValue,
        suggestions,
        handleSelect, // The modified handleSelect
        geocodeAndEmit,
        ready: sdkReady && hookReady, // Combined readiness state
    };
};
