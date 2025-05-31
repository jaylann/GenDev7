"use client";

import React, { JSX, useCallback, useEffect, useRef, useState } from "react";
import { useAddressAutocomplete } from "@/hooks/use-address-autocomplete";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Address } from "@/types/address";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { AddressSuggestionsList } from "./address-suggestion-list";
import { isAddressStructurallyValid } from "@/utils/validators";
import { logger } from "@/utils/logger";

export type ParsedAddress = Address;

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!apiKey) {
    logger.error(
        "AddressAutocomplete",
        "❌ Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY – autocomplete disabled.",
    );
}

export interface AddressAutocompleteInputProps {
    /** Optional initial raw input text. Used if `parsedAddress` is not provided. */
    initialValue?: string;
    /** Prefills the input from a trusted Address object if provided. Takes precedence over `initialValue`. */
    parsedAddress?: ParsedAddress | null;
    /** Fallback placeholder text if no initial value or parsedAddress is given. */
    defaultAddressText?: string;
    /** Callback invoked with `(parsedAddress | null, fullText)` on selection, typing, or clearing. */
    onAddressSelectAction: (
        addr: ParsedAddress | null,
        fullText: string,
    ) => void;
    /** Optional Tailwind CSS classes for the input element. */
    inputClassName?: string;
    /** Optional Tailwind CSS classes for the wrapper div. */
    containerClassName?: string;
    /** Disables both input and suggestion list when true. */
    disabled?: boolean;
    /** Callback invoked when Enter is pressed on a valid address. */
    onEnterSearch?: () => void;
}

/**
 * AddressAutocompleteInput
 *
 * Renders a text input with Google Maps-powered location autocomplete,
 * enforces custom format validation (e.g., German house numbers), and displays suggestions.
 *
 * @remarks
 * - Applies a red border to invalid, non-empty inputs.
 * - Supports keyboard navigation: ArrowUp/ArrowDown to traverse suggestions,
 *   Enter to select or search, and Escape to close the list.
 * - When `parsedAddress` prop changes, it attempts to prefill the input with a Google Maps formatted version of that address.
 *
 * @param props - The component props.
 * @returns {JSX.Element} The rendered AddressAutocompleteInput component.
 * @component
 */
export const AddressAutocompleteInput: React.FC<
    AddressAutocompleteInputProps
> = ({
    initialValue: initialValueFromProps, // Renamed to avoid conflict
    parsedAddress: externalParsedAddress,
    defaultAddressText,
    onAddressSelectAction,
    inputClassName,
    containerClassName,
    disabled,
    onEnterSearch,
}): JSX.Element => {
    const [error, setError] = useState<boolean>(false);
    const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
    const [highlightedIdx, setHighlightedIdx] = useState<number>(-1);

    const inputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLUListElement | null>(null);
    useOutsideClick([inputRef, listRef], () => setShowSuggestions(false));

    // Ref to track if the current externalParsedAddress has been used to prefill the input.
    const hasPrefilledRef = useRef(false);
    // Ref to track if the user has typed in the input since the last externalParsedAddress was set.
    const hasUserTypedRef = useRef(false);
    // Ref to store the previous externalParsedAddress to detect changes.
    const prevExternalParsedAddressRef = useRef<
        ParsedAddress | null | undefined
    >(null);

    /**
     * handleAddressParsed
     * Processes address parsing events, forwarding results to the parent and managing validation state.
     */
    const handleAddressParsed = useCallback(
        (addr: ParsedAddress | null, fullText: string): void => {
            onAddressSelectAction(addr, fullText); // Propagate to parent

            if (fullText.trim() === "") {
                setError(false); // Empty input is not an error for display purposes
                return;
            }
            setError(!isAddressStructurallyValid(addr));
        },
        [onAddressSelectAction],
    );

    const {
        value,
        setValue,
        suggestions,
        ready, // This is true when the usePlacesAutocomplete hook is ready
        handleSelect: hookHandleSelect,
        geocodeAndEmit: hookGeocodeAndEmit,
    } = useAddressAutocomplete({
        onAddressSelectAction: handleAddressParsed,
        // If externalParsedAddress is provided, its useEffect below will handle setting the value.
        initialValue: externalParsedAddress
            ? undefined
            : (initialValueFromProps ?? defaultAddressText ?? ""),
    });

    /**
     * Effect to reset prefill/typing flags when externalParsedAddress changes.
     * This ensures that if a new address is provided (e.g., from a recent search),
     * the prefill logic can run again for this new address.
     */
    useEffect(() => {
        const currentAddrString = externalParsedAddress
            ? JSON.stringify(externalParsedAddress)
            : null;
        const prevAddrString = prevExternalParsedAddressRef.current
            ? JSON.stringify(prevExternalParsedAddressRef.current)
            : null;

        if (currentAddrString !== prevAddrString) {
            hasUserTypedRef.current = false;
            hasPrefilledRef.current = false; // Allow prefilling for the new address
            prevExternalParsedAddressRef.current = externalParsedAddress;
        }
    }, [externalParsedAddress]);

    /**
     * Effect to prefill the input when a valid `externalParsedAddress` is provided
     * and the Maps API is ready. This is useful for setting the input from a slug
     * or an existing address object.
     */
    useEffect(() => {
        if (
            !ready || // Maps API/hook not ready
            !externalParsedAddress || // No external address to prefill from
            hasPrefilledRef.current || // Already prefilled for THIS specific externalParsedAddress
            hasUserTypedRef.current // User has typed since THIS externalParsedAddress was set
        ) {
            return;
        }

        const abortController = new AbortController();
        const signal = abortController.signal;

        (async () => {
            const rawQueryText = `${externalParsedAddress.street} ${externalParsedAddress.house_number}, ${externalParsedAddress.plz} ${externalParsedAddress.city}`;
            let googleFormattedAddress = rawQueryText; // Fallback to raw concatenation

            if (window.google?.maps?.Geocoder && !signal.aborted) {
                try {
                    const geocoder = new window.google.maps.Geocoder();
                    const { results } = await geocoder.geocode(
                        { address: rawQueryText },
                        (results, status) => {
                            if (signal.aborted) return;
                            if (
                                status ===
                                    window.google.maps.GeocoderStatus.OK &&
                                results &&
                                results.length > 0
                            ) {
                                googleFormattedAddress =
                                    results[0].formatted_address ||
                                    rawQueryText;
                            } else {
                                logger.warn(
                                    "AddressAutocompleteInput",
                                    `Geocoding for prefill of "${rawQueryText}" failed with status: ${status}`,
                                );
                            }
                        },
                    );
                    // The callback above might be called after the promise resolves for geocode
                    // To be safe, re-check results if promise resolves successfully
                    if (
                        results &&
                        results.length > 0 &&
                        results[0].formatted_address
                    ) {
                        googleFormattedAddress = results[0].formatted_address;
                    }
                } catch (e) {
                    if (!signal.aborted) {
                        logger.warn(
                            "AddressAutocompleteInput",
                            `Geocoding error during prefill for "${rawQueryText}"`,
                            e,
                        );
                    }
                    // googleFormattedAddress remains `rawQueryText`
                }
            }

            if (signal.aborted) return;

            // Check flags again, in case user typed during the async geocoding operation
            if (!hasUserTypedRef.current) {
                setValue(googleFormattedAddress, false); // Update the input field's text
                // Notify parent about this prefilled, formatted address AND the original structured object
                // This will also trigger validation (setError) via handleAddressParsed.
                onAddressSelectAction(
                    externalParsedAddress,
                    googleFormattedAddress,
                );
                hasPrefilledRef.current = true; // Mark that prefilling for this externalParsedAddress instance is done.
            }
        })();

        return () => {
            abortController.abort();
        };
    }, [externalParsedAddress, ready, setValue, onAddressSelectAction]);

    /**
     * Effect to handle cases where the input is cleared or externalParsedAddress becomes null.
     * Ensures the parent is notified correctly to clear validation/address state.
     */
    useEffect(() => {
        if (!externalParsedAddress && value.trim() === "") {
            // If no external address and input is empty, ensure parent knows address is null.
            handleAddressParsed(null, "");
        }
    }, [value, externalParsedAddress, handleAddressParsed]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        hasUserTypedRef.current = true; // User is now interacting
        const newValue = e.target.value;
        setValue(newValue); // This updates the value in the hook and fetches suggestions
        setShowSuggestions(true);
        setError(false); // Clear error on typing; validation will occur on select/enter
        setHighlightedIdx(-1);
        if (!newValue.trim()) {
            // If input becomes empty, immediately notify parent and clear validation state
            handleAddressParsed(null, "");
        }
    };

    const totalSuggestions = suggestions.data.length;

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        switch (e.key) {
            case "ArrowDown":
                if (totalSuggestions === 0) break;
                e.preventDefault();
                if (!showSuggestions) setShowSuggestions(true);
                setHighlightedIdx((prev) => (prev + 1) % totalSuggestions);
                break;
            case "ArrowUp":
                if (totalSuggestions === 0) break;
                e.preventDefault();
                if (!showSuggestions) setShowSuggestions(true);
                setHighlightedIdx(
                    (prev) => (prev - 1 + totalSuggestions) % totalSuggestions,
                );
                break;
            case "Enter":
                e.preventDefault();
                setShowSuggestions(false); // Close suggestions on Enter in all cases
                if (
                    showSuggestions && // Check showSuggestions before it's set to false
                    suggestions.status === "OK" &&
                    totalSuggestions > 0 &&
                    highlightedIdx !== -1 // Ensure a suggestion was actually highlighted
                ) {
                    await hookHandleSelect(
                        suggestions.data[highlightedIdx].description,
                    );
                } else if (value.trim()) {
                    // User typed text and pressed Enter, or no suggestion was actively selected
                    const parsedAddrObject = await hookGeocodeAndEmit(value);

                    if (isAddressStructurallyValid(parsedAddrObject)) {
                        onEnterSearch?.();
                    }
                }
                break;
            case "Escape":
                setShowSuggestions(false);
                break;
        }
    };

    const handleSuggestionSelect = async (description: string) => {
        await hookHandleSelect(description);
        setShowSuggestions(false);
        inputRef.current?.focus(); // Return focus to input after selection
    };

    if (!apiKey) {
        return (
            <div className={cn("relative w-full", containerClassName)}>
                <Input
                    type="text"
                    placeholder="Address service disabled (No API Key)"
                    className={cn(
                        "h-12 text-red-400 placeholder:text-red-700/80 bg-red-900/30 border-red-700",
                        inputClassName,
                    )}
                    disabled
                />
            </div>
        );
    }

    return (
        <div className={cn("relative w-full", containerClassName)}>
            <Input
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    if (value.trim() && suggestions.data.length > 0)
                        setShowSuggestions(true);
                }}
                placeholder={
                    defaultAddressText ||
                    "Landsberger Str. 110, 80339 München, Germany"
                }
                className={cn(
                    "h-12 bg-slate-800/50 dark:bg-slate-800/50",
                    inputClassName,
                    error &&
                        "border-red-500 focus:border-red-500 focus:ring-red-500",
                )}
                disabled={disabled || !ready}
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={showSuggestions && totalSuggestions > 0}
                aria-activedescendant={
                    highlightedIdx >= 0 && totalSuggestions > 0
                        ? `addr-opt-${highlightedIdx}`
                        : undefined
                }
            />
            {!ready && !disabled && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-5 animate-spin text-slate-400" />
            )}
            <AddressSuggestionsList
                ref={listRef}
                show={showSuggestions}
                suggestions={suggestions}
                highlightedIndex={highlightedIdx}
                onSelect={handleSuggestionSelect}
            />
        </div>
    );
};
