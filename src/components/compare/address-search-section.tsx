/**
 * @module AddressSearchSection
 *
 * Renders an address autocomplete input with search controls, handling
 * loading states for both manual searches and slug-based initializations,
 * and forwarding selection and search events to parent handlers.
 */
import React, { FC, JSX } from "react";
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
 * AddressSearchSection
 *
 * Renders an address autocomplete input alongside a search button,
 * supporting loading states for both manual and slug-based searches.
 *
 * @param parsedAddress - The selected Address object from autocomplete, if available.
 * @param defaultAddressText - Initial placeholder text for the input.
 * @param onAddressSelect - Callback invoked when the user selects an address or modifies input text.
 * @param onSearchClick - Callback invoked when the search button is activated.
 * @param isSearchDisabled - Whether the search control is disabled.
 * @param isLoading - True while a manual search operation is in progress.
 * @param isLoadingFromSlug - True while initializing via a shared slug.
 * @param currentSlug - The shared slug identifier, if present.
 * @returns {JSX.Element} The AddressSearchSection component.
 *
 * @remarks
 * - Disables input and button controls when API key is absent or during loading.
 * - Button label updates to reflect loading or default states.
 * - Pressing "Enter" triggers a search when controls are enabled.
 *
 * @component
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
}): JSX.Element => {
    // Determine if Google Maps API key is available for autocomplete functionality.
    const hasApiKey = !!GOOGLE_MAPS_API_KEY_FROM_ENV;

    // Disable input when API key is missing or any loading state is active.
    const inputDisabled = !hasApiKey || isLoadingFromSlug || isLoading;

    // Select button label and icon based on loading and slug states.
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

    // Forward internal address selection and text changes to parent callback.
    const handleInternalAddressSelect = (
        address: Address | null,
        fullText: string,
    ): void => {
        onAddressSelect(address, fullText);
    };
    // Computed flag to disable search button if control disabled or API key is missing.
    const disableSearchButton = isSearchDisabled || !hasApiKey;

    // Trigger search click action on Enter key when controls are enabled.
    const handleEnterSearch = () => {
        if (!disableSearchButton && !isLoading && !isLoadingFromSlug) {
            onSearchClick();
        }
    };

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
                    onClick={handleEnterSearch}
                    disabled={disableSearchButton}
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
