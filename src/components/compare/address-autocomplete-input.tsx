/**
 * AddressAutocompleteInput Module
 *
 * Provides a reusable input component with Google Maps-based autocomplete.
 * Handles querying suggestions, selecting an address, formatting parsed addresses,
 * and emitting selection events via onAddressSelect.
 */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAddressAutocomplete } from "@/hooks/use-address-autocomplete";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Address } from "@/types/address";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { AddressSuggestionsList } from "./address-suggestion-list";

export type ParsedAddress = Address;

// Validate that the Google Maps API key is present for enabling autocomplete.
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
    onAddressSelectAction: (addr: ParsedAddress | null, full: string) => void;
    inputClassName?: string;
    containerClassName?: string;
    disabled?: boolean;
    /**
     * Triggered when the user presses Enter *and* the suggestion list is closed.
     */
    onEnterSearch?: () => void;
}

/**
 * AddressAutocompleteInput component renders a text input with location autocomplete.
 *
 * Props:
 *  - initialValue: Optional initial raw input text.
 *  - parsedAddress: If provided, will reverse-geocode and format into the input.
 *  - defaultAddressText: Fallback placeholder value when no initialValue.
 *  - onAddressSelect: Callback invoked with (parsedAddress | null, fullText).
 *  - onEnterSearch: Callback invoked when Enter is pressed with no open suggestions.
 *  - inputClassName, containerClassName: Tailwind CSS class overrides.
 *  - disabled: Disable input and suggestions.
 *
 * @returns JSX.Element
 */
export const AddressAutocompleteInput: React.FC<
    AddressAutocompleteInputProps
> = ({
         initialValue,
         parsedAddress,
         defaultAddressText,
         onAddressSelectAction,
         inputClassName,
         containerClassName,
         disabled,
         onEnterSearch,
     }) => {
    // Initialize autocomplete hook: manages input value, suggestion list, and selection logic.
    const {
        value,
        setValue,
        suggestions,
        ready,
        handleSelect,
        geocodeAndEmit,
    } = useAddressAutocomplete({
        onAddressSelectAction,
        initialValue: parsedAddress
            ? undefined
            : (initialValue ?? defaultAddressText ?? ""),
    });

    const [highlightedIdx, setHighlightedIdx] = useState<number>(-1);

    // 🛠 One-time prefill when loading parsedAddress from slug
    const hasPrefilledRef = useRef(false);

    useEffect(() => {
        if (!ready || !parsedAddress || hasPrefilledRef.current) return;
        (async () => {
            const raw = `${parsedAddress.street} ${parsedAddress.house_number}, ${parsedAddress.plz} ${parsedAddress.city}`;
            let formatted = raw;
            if (window.google?.maps?.Geocoder) {
                try {
                    const { results } = await new window.google.maps.Geocoder().geocode({ address: raw });
                    formatted = results[0]?.formatted_address ?? raw;
                } catch {
                    // silently ignore and use raw
                }
            }

            setValue(formatted, false);
            // 1️⃣ Fill the input so the user sees the nice, formatted address
            // 2️⃣ INTENTIONALLY **do not** call `onAddressSelect` here –
            //     calling it would overwrite the “Loaded … offers.” status
            //     that was just shown after the slug fetch.
            hasPrefilledRef.current = true;
        })();
    }, [parsedAddress, ready, setValue]);

    // 🛠 Notify parent when user clears the field entirely
    useEffect(() => {
        if (parsedAddress || value.trim() !== "") return;
        onAddressSelectAction(null, "");
    }, [value, onAddressSelectAction, parsedAddress]);

    // Refs for handling focus and outside-click detection.
    const inputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLUListElement | null>(null);  // NEW
    const [showSuggestions, setShowSuggestions] = useState(false);
    useOutsideClick([inputRef, listRef], () => {
        setShowSuggestions(false);
    });

    // Update input value, show suggestions, and clear selection if input emptied.
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setValue(newValue);
        setShowSuggestions(true);
        setHighlightedIdx(-1);
        if (!newValue.trim()) onAddressSelectAction(null, "");
    };

    const total = suggestions.data.length;

    // Handle keyboard navigation and selection
    const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        switch (e.key) {
            case "ArrowDown": {
                if (total === 0) break;
                e.preventDefault();
                if (!showSuggestions) setShowSuggestions(true);
                setHighlightedIdx((prev) => (prev + 1) % total);
                break;
            }
            case "ArrowUp": {
                if (total === 0) break;
                e.preventDefault();
                if (!showSuggestions) setShowSuggestions(true);
                setHighlightedIdx((prev) => (prev - 1 + total) % total);
                break;
            }
            case "Enter": {
                e.preventDefault();
                if (
                    showSuggestions &&
                    suggestions.status === "OK" &&
                    total > 0
                ) {
                    const idx = highlightedIdx >= 0 ? highlightedIdx : 0;
                    await handleSelect(suggestions.data[idx].description);
                } else if (value.trim()) {
                    setShowSuggestions(false);
                    await geocodeAndEmit(value);
                    onEnterSearch?.();
                }
                break;
            }
            case "Escape":
                setShowSuggestions(false);
                break;
        }
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
                    if (value.trim()) setShowSuggestions(true);
                }}
                placeholder="Street 123, 12345 City"
                className={cn("h-12 bg-slate-800/50 dark:bg-slate-800/50", inputClassName)}
                disabled={disabled || !ready}
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={showSuggestions && total > 0}
                aria-activedescendant={
                    highlightedIdx >= 0 ? `addr-opt-${highlightedIdx}` : undefined
                }
            />
            {!ready && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-5 animate-spin text-slate-400" />
            )}
            <AddressSuggestionsList
                ref={listRef}
                show={showSuggestions}
                suggestions={suggestions}
                highlightedIndex={highlightedIdx}
                onSelect={async (d) => {
                    await handleSelect(d);
                    setShowSuggestions(false);
                }}
            />
        </div>
    );
};
