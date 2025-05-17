'use client';
import React, {useEffect, useRef} from 'react';
import {useAddressAutocomplete} from '@/hooks/use-address-autocomplete';
import {Input} from '@/components/ui/input';
import {Loader2} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Address} from '@/types/address';
import {useOutsideClick} from '@/hooks/use-outside-click';
import {AddressSuggestionsList} from './address-suggestion-list';

export type ParsedAddress = Address;

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!apiKey) {
    console.error('❌ PRE-CHECK: Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY – autocomplete disabled.',);
}

export interface AddressAutocompleteInputProps {
    initialValue?: string;
    parsedAddress?: ParsedAddress;
    defaultAddressText?: string;
    onAddressSelect: (addr: ParsedAddress | null, full: string) => void;
    inputClassName?: string;
    containerClassName?: string;
    disabled?: boolean;
}

export const AddressAutocompleteInput: React.FC<AddressAutocompleteInputProps> = ({
                                                                                      initialValue,
                                                                                      parsedAddress,
                                                                                      defaultAddressText,
                                                                                      onAddressSelect,
                                                                                      inputClassName,
                                                                                      containerClassName,
                                                                                      disabled,
                                                                                  }) => {
    const {
        value, setValue, suggestions, ready, handleSelect, geocodeAndEmit,
    } = useAddressAutocomplete({
        onAddressSelect, initialValue: parsedAddress ? undefined : initialValue ?? defaultAddressText ?? '',
    });

    useEffect(() => {
        if (!ready) return;

        if (parsedAddress) {
            (async () => {
                const raw = `${parsedAddress.street} ${parsedAddress.house_number}, ${parsedAddress.plz} ${parsedAddress.city}`;
                let formatted = raw;
                if (window.google?.maps?.Geocoder) {
                    try {
                        const results = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
                            new window.google.maps.Geocoder().geocode({address: raw}, (res, status) => {
                                if (status === 'OK' && res) resolve(res); else reject(status);
                            },);
                        });
                        formatted = results[0]?.formatted_address ?? raw;
                    } catch (error) {
                        console.error('Geocode failed for parsedAddress:', error);
                    }
                }

                setValue(formatted, false);
                onAddressSelect(parsedAddress, formatted);
            })();
        } else if (value === '') {
            onAddressSelect(null, '');
        }
    }, [parsedAddress, ready, setValue, onAddressSelect, value]);

    // Use correct element types for refs
    const inputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    useOutsideClick([inputRef, listRef], () => {
        setShowSuggestions(false);
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setValue(newValue);
        setShowSuggestions(true);
        if (!newValue.trim()) onAddressSelect(null, '');
    };

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (showSuggestions && suggestions.status === 'OK' && suggestions.data.length > 0) {
                await handleSelect(suggestions.data[0].description);
            } else if (value.trim()) {
                setShowSuggestions(false);
                await geocodeAndEmit(value);
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    if (!apiKey) {
        return (<div className={cn('relative w-full', containerClassName)}>
            <Input
                type="text"
                placeholder="Address service disabled (No API Key)"
                className={cn('h-12 text-red-400 placeholder:text-red-700/80 bg-red-900/30 border-red-700', inputClassName,)}
                disabled
            />
        </div>);
    }

    return (<div className={cn('relative w-full', containerClassName)}>
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
            className={cn('h-12', inputClassName)}
            disabled={disabled || !ready}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={showSuggestions && suggestions.status === 'OK' && suggestions.data.length > 0}
        />
        {!ready && (<Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 size-5 animate-spin text-slate-400"
        />)}

        <div ref={listRef}>
            <AddressSuggestionsList
                show={showSuggestions}
                suggestions={suggestions}
                onSelect={async (d) => {
                    await handleSelect(d);
                    setShowSuggestions(false);
                }}
            />
        </div>
    </div>);
};
