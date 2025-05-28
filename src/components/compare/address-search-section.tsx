/**
 * AddressSearchSection Module
 *
 * Provides an address autocomplete input with a search button,
 * managing loading states (search vs slug load) and delegating
 * selection and search actions to parent handlers.
 */
import React, { FC } from "react";
import { Button } from "@/components/ui/button";
import { LoaderCircle, Search as SearchIcon } from "lucide-react";
import { AddressAutocompleteInput } from "@/components/compare/address-autocomplete-input";
import { cn } from "@/lib/utils";
import { GOOGLE_MAPS_API_KEY_FROM_ENV } from "@/config/constants";
import { Address } from "@/types/address";

interface AddressSearchSectionProps {
    parsedAddress?: Address;
    defaultAddressText?: string;
    onAddressSelect: (address: Address | null, fullText: string) => void;
    onSearchClick: () => void;
    isSearchDisabled: boolean;
    isLoading: boolean; // General loading state for the search button (e.g. "Searching...")
    isLoadingFromSlug: boolean; // Specific loading state if loading from a shared slug (e.g. "Loading...")
    currentSlug: string | null; // To differentiate button text
}

/**
 * Section containing the address input and search button.
 *
 * @param parsedAddress      The address object selected from autocomplete, if any.
 * @param defaultAddressText Initial text to display in the address input.
 * @param onAddressSelect    Callback when an address is selected or input text changes.
 * @param onSearchClick      Callback when the search button is clicked.
 * @param isSearchDisabled   Whether the search button should be disabled.
 * @param isLoading          True when a search operation is in progress.
 * @param isLoadingFromSlug  True when initializing from a shared slug.
 * @param currentSlug        The current shared slug, if any.
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
    // Check for presence of Google Maps API key for autocomplete.
    const hasApiKey = !!GOOGLE_MAPS_API_KEY_FROM_ENV;

    // Disable input if no API key or during loading states.
    const inputDisabled = !hasApiKey || isLoadingFromSlug || isLoading;

    // Determine the button label and icon based on loading and slug states.
    const renderButtonContent = () => {
        if (isLoading && !currentSlug && !isLoadingFromSlug) {
            return (
                <>
                    <LoaderCircle className="animate-spin w-5 h-5 mr-2" />
                    Searching...
                </>
            );
        }
        if (isLoadingFromSlug) {
            return (
                <>
                    <LoaderCircle className="animate-spin w-5 h-5 mr-2" />
                    Loading...
                </>
            );
        }
        return (
            <>
                <SearchIcon className="size-5 mr-2" />
                Search
            </>
        );
    };

    // Internal handler to forward address selection events.
    const handleInternalAddressSelect = (
        address: Address | null,
        fullText: string,
    ): void => {
        onAddressSelect(address, fullText);
    };

    // Runs only when the button is actually clickable.
    const handleEnterSearch = () => {
        if (!isSearchDisabled && !isLoading && !isLoadingFromSlug) {
            onSearchClick();
        }
    };

    // Layout section wrapping the address input and search button.
    return (
        <section className="max-w-2xl mx-auto px-4 py-2 md:px-0">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 md:gap-4">
                <AddressAutocompleteInput
                    parsedAddress={parsedAddress}
                    initialValue={defaultAddressText || ""}
                    onAddressSelectAction={handleInternalAddressSelect}
                    onEnterSearch={handleEnterSearch}
                    inputClassName="bg-slate-800/50 border-slate-700 placeholder:text-slate-400 rounded-lg px-3 py-2 text-sm sm:text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    containerClassName="flex-grow"
                    disabled={inputDisabled}
                />
                <Button
                    onClick={onSearchClick}
                    disabled={isSearchDisabled || !hasApiKey}
                    className={cn(
                        "bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 sm:px-8 rounded-lg w-full sm:w-auto text-sm sm:text-base shrink-0 h-10 sm:h-12",
                    )}
                    size="lg"
                >
                    {renderButtonContent()}
                </Button>
            </div>
        </section>
    );
};
