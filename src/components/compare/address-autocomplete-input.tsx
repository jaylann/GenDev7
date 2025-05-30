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

export type ParsedAddress = Address;

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!apiKey) {
    console.error(
        "❌ PRE-CHECK: Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY – autocomplete disabled.",
    );
}

export interface AddressAutocompleteInputProps {
    initialValue?: string;
    parsedAddress?: ParsedAddress;
    defaultAddressText?: string;
    onAddressSelectAction: (
        addr: ParsedAddress | null,
        fullText: string,
    ) => void;
    inputClassName?: string;
    containerClassName?: string;
    disabled?: boolean;
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
 *
 * @param initialValue - Optional initial raw input text.
 * @param parsedAddress - Prefills the input from a trusted Address object if provided.
 * @param defaultAddressText - Fallback placeholder text if no initial value is given.
 * @param onAddressSelectAction - Callback invoked with `(parsedAddress | null, fullText)` on selection, typing, or clearing.
 * @param onEnterSearch - Callback invoked when Enter is pressed on a valid address.
 * @param inputClassName - Optional Tailwind CSS classes for the input element.
 * @param containerClassName - Optional Tailwind CSS classes for the wrapper div.
 * @param disabled - Disables both input and suggestion list when true.
 * @returns {JSX.Element} The rendered AddressAutocompleteInput component.
 *
 * @component
 */
export const AddressAutocompleteInput: React.FC<
    AddressAutocompleteInputProps
> = ({
    initialValue,
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

    const hasPrefilledRef = useRef(false);
    const hasUserTypedRef = useRef(false);

    /**
     * handleAddressParsed
     *
     * Processes address parsing events, forwarding results to the parent and managing validation state.
     *
     * @remarks
     * - Clears error state when input is empty.
     * - Uses isAddressStructurallyValid to set error state for non-empty inputs.
     *
     * @param addr - The parsed Address object, or null if parsing/API lookup failed.
     * @param fullText - The full input string or formatted suggestion.
     * @returns {void}
     *
     * @private
     */
    const handleAddressParsed = useCallback(
        (addr: ParsedAddress | null, fullText: string): void => {
            onAddressSelectAction(addr, fullText); // Propagate to parent

            if (fullText.trim() === "") {
                setError(false); // Empty input is not an error for display purposes
                return;
            }
            // If text is present, validate it.
            // isAddressStructurallyValid checks for non-null addr and valid house_number.
            if (isAddressStructurallyValid(addr)) {
                setError(false);
            } else {
                setError(true);
            }
        },
        [onAddressSelectAction],
    );

    const {
        value,
        setValue,
        suggestions,
        ready,
        handleSelect: hookHandleSelect,
        geocodeAndEmit: hookGeocodeAndEmit,
    } = useAddressAutocomplete({
        onAddressSelectAction: handleAddressParsed, // Use the wrapped handler
        initialValue: externalParsedAddress
            ? undefined // If parsedAddress is given, prefill effect will handle it
            : (initialValue ?? defaultAddressText ?? ""),
    });

    useEffect(() => {
        if (
            !ready ||
            !externalParsedAddress ||
            hasPrefilledRef.current ||
            hasUserTypedRef.current
        )
            return;
            
        // Create an AbortController to cancel pending operations if the component unmounts
        const abortController = new AbortController();
        
        (async () => {
            const raw = `${externalParsedAddress.street} ${externalParsedAddress.house_number}, ${externalParsedAddress.plz} ${externalParsedAddress.city}`;
            let formatted = raw;
            
            if (window.google?.maps?.Geocoder && !abortController.signal.aborted) {
                try {
                    const { results } =
                        await new window.google.maps.Geocoder().geocode({
                            address: raw,
                        });
                    formatted = results[0]?.formatted_address ?? raw;
                    
                    // Check if the component has been unmounted or dependencies changed
                    if (abortController.signal.aborted) return;
                    
                    if (formatted === value) {
                        // Check if value already matches to prevent loop
                        hasPrefilledRef.current = true;
                        return;
                    }
                } catch {
                    /* Silently ignore and use raw */
                }
            }
            
            // Only update state if the component is still mounted
            if (!abortController.signal.aborted) {
                setValue(formatted, false);
                // Do not call handleAddressParsed here; prefilled slugs are assumed valid until user interaction.
                // If validation of prefilled slugs is desired, call handleAddressParsed(externalParsedAddress, formatted);
                hasPrefilledRef.current = true;
            }
        })();
        
        // Cleanup function to abort any in-flight operations when component unmounts
        return () => {
            abortController.abort();
        };
    }, [externalParsedAddress, ready, setValue, value]); // Added value to deps to re-evaluate if value changes externally

    useEffect(() => {
        // This effect ensures that if the input is cleared OR if externalParsedAddress becomes null
        // (and input is empty), the parent is notified correctly.
        if (externalParsedAddress || value.trim() !== "") return;
        // This call will go through handleAddressParsed, which sets error to false for empty strings.
        handleAddressParsed(null, "");
    }, [value, handleAddressParsed, externalParsedAddress]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        hasUserTypedRef.current = true;
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
                if (
                    showSuggestions &&
                    suggestions.status === "OK" &&
                    totalSuggestions > 0
                ) {
                    const idx = highlightedIdx >= 0 ? highlightedIdx : 0;
                    // hookHandleSelect calls onAddressSelectAction (our handleAddressParsed) internally.
                    // handleAddressParsed will set the error state based on the selected address.
                    await hookHandleSelect(suggestions.data[idx].description);
                    setShowSuggestions(false);
                } else if (value.trim()) {
                    // User typed text and pressed Enter
                    setShowSuggestions(false);
                    // hookGeocodeAndEmit calls onAddressSelectAction (our handleAddressParsed) internally.
                    // handleAddressParsed will set the error state.
                    const parsedAddrObject = await hookGeocodeAndEmit(value);

                    // Only call onEnterSearch if the address is fully valid after geocoding and custom validation.
                    // isAddressStructurallyValid checks for non-null parsedAddrObject and valid house_number.
                    if (isAddressStructurallyValid(parsedAddrObject)) {
                        onEnterSearch?.();
                    }
                    // The error state (for red border) is already set by handleAddressParsed via hookGeocodeAndEmit.
                }
                break;
            case "Escape":
                setShowSuggestions(false);
                break;
        }
    };

    const handleSuggestionSelect = async (description: string) => {
        // hookHandleSelect calls onAddressSelectAction (handleAddressParsed) internally,
        // which will set the error state.
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
                placeholder="Street 123, 12345 City"
                className={cn(
                    "h-12 bg-slate-800/50 dark:bg-slate-800/50",
                    inputClassName,
                    error &&
                        "border-red-500 focus:border-red-500 focus:ring-red-500", // Apply error styling
                )}
                disabled={disabled || !ready}
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={showSuggestions && totalSuggestions > 0}
                aria-activedescendant={
                    highlightedIdx >= 0
                        ? `addr-opt-${highlightedIdx}`
                        : undefined
                }
            />
            {!ready &&
                !disabled && ( // Show loader only if not disabled and SDK not ready
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
