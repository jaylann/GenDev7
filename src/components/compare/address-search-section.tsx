import React, {FC} from 'react';
import {Button} from '@/components/ui/button';
import {LoaderCircle, Search as SearchIcon} from 'lucide-react';
import {
    AddressAutocompleteInput, ParsedAddress as AutocompleteParsedAddress, ParsedAddress,
} from '@/components/compare/address-autocomplete-input';
import {cn} from '@/lib/utils';
import {GOOGLE_MAPS_API_KEY_FROM_ENV} from "@/config/constants";

interface AddressSearchSectionProps {
    parsedAddress?: ParsedAddress;
    defaultAddressText?: string;
    onAddressSelect: (address: ParsedAddress | null, fullText: string) => void;
    onSearchClick: () => void;
    isSearchDisabled: boolean;
    isLoading: boolean; // General loading state for the search button (e.g. "Searching...")
    isLoadingFromSlug: boolean; // Specific loading state if loading from a shared slug (e.g. "Loading...")
    currentSlug: string | null; // To differentiate button text
}

/**
 * Section containing the address autocomplete input and the search button.
 * @param initialSearchQuery - The initial query to display in the address input.
 * @param onAddressSelect - Callback when an address is selected or input changes.
 * @param onSearchClick - Callback when the search button is clicked.
 * @param isSearchDisabled - Controls if the search button is disabled.
 * @param isLoading - Indicates if a search operation is in progress.
 * @param isLoadingFromSlug - Indicates if loading shared data.
 * @param currentSlug - The current slug, if any.
 */
export const AddressSearchSection: FC<AddressSearchSectionProps> = ({
                                                                        parsedAddress,
                                                                        defaultAddressText,
                                                                        onAddressSelect,
                                                                        onSearchClick,
                                                                        isSearchDisabled,
                                                                        isLoading,
                                                                        isLoadingFromSlug,
                                                                        currentSlug,
                                                                    }) => {
    const hasApiKey = !!GOOGLE_MAPS_API_KEY_FROM_ENV;

    // Compute input disabled state
    const inputDisabled = !hasApiKey || isLoadingFromSlug || isLoading;

    // Extract button content rendering from nested ternary
    const renderButtonContent = () => {
        if (isLoading && !currentSlug && !isLoadingFromSlug) {
            return <><LoaderCircle className="animate-spin w-5 h-5 mr-2"/>Searching...</>;
        }
        if (isLoadingFromSlug) {
            return <><LoaderCircle className="animate-spin w-5 h-5 mr-2"/>Loading...</>;
        }
        return <><SearchIcon className="size-5 mr-2"/>Search</>;
    };

    const handleInternalAddressSelect = (address: AutocompleteParsedAddress | null, fullText: string): void => {
        onAddressSelect(address as ParsedAddress | null, fullText);
    };

    return (<section className="max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <AddressAutocompleteInput
                    key={defaultAddressText} // Force re-mount and re-init when defaultAddressText changes
                    parsedAddress={parsedAddress}
                    initialValue={defaultAddressText || ''}
                    onAddressSelect={handleInternalAddressSelect}
                    inputClassName="bg-slate-800/50 border-slate-700 placeholder:text-slate-400 rounded-lg text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    containerClassName="flex-grow"
                    disabled={inputDisabled} // Also disable if normal search is loading
                />
                <Button
                    onClick={onSearchClick}
                    disabled={isSearchDisabled || !hasApiKey}
                    className={cn("bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 rounded-lg w-full sm:w-auto text-base shrink-0 h-12")}
                    size="lg"
                >
                    {renderButtonContent()}
                </Button>
            </div>
        </section>);
};