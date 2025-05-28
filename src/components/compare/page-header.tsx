/****
 * PageHeader Module
 *
 * Renders the header of the comparison page including the title,
 * an API key warning if necessary, and operational status messages.
 */
import React, { FC } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { GOOGLE_MAPS_API_KEY_FROM_ENV } from "@/config/constants";

interface PageHeaderProps {
    mainStatusMessage: string; // Renamed for clarity
    offerCount: number | null; // New prop for offer count
    isLoading: boolean; // New prop for loading state
    isRefining: boolean; // New prop for refining state
}

/**
 * PageHeader component displays the main page header UI.
 *
 * Shows:
 *  - The page title ("Compare Internet Providers")
 *  - A warning if the Google Maps API key is missing
 *  - A status message provided via props
 *
 * @param statusMessage - The current operational status message to display.
 * @returns JSX.Element
 */
export const PageHeader: FC<PageHeaderProps> = ({
                                                    mainStatusMessage,
                                                    offerCount,
                                                    isLoading,
                                                    isRefining,
                                                }) => {
    const hasApiKey = !!GOOGLE_MAPS_API_KEY_FROM_ENV;

    return (
        <header className="text-center px-4 py-2 space-y-1 sm:space-y-2 md:px-0">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white">
                Compare Internet Providers
            </h1>

            {!hasApiKey && (
                <p className="text-xs sm:text-sm text-red-400 flex items-center justify-center gap-1">
                    <AlertCircle className="size-4" />
                    Google Maps API Key missing. Address search is disabled.
                </p>
            )}

            {/* Main Status Message - focused on input and critical connection status */}
            {mainStatusMessage && (
                <p className="text-xs sm:text-sm text-slate-500 min-h-[20px]">
                    {mainStatusMessage}
                </p>
            )}

            {/* NEW: Loading Indicator and Offer Count Section */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 min-h-[20px] sm:min-h-[24px]">
                {/* Loading Spinner */}
                {(isLoading || isRefining) && (
                    <div className="flex items-center gap-1 text-slate-400">
                        <Loader2 className="size-4 animate-spin" />
                        <span className="text-xs sm:text-sm">
                            {isRefining ? "Refining results..." : "Loading offers..."}
                        </span>
                    </div>
                )}

                {/* Offer Count - only show if not actively initial loading and offers exist */}
                {!isLoading && offerCount !== null && offerCount > 0 && (
                    <p className="text-xs sm:text-sm text-slate-300">
                        {offerCount} {offerCount === 1 ? "offer" : "offers"} found
                    </p>
                )}
                {!isLoading && offerCount === 0 && !mainStatusMessage.includes("Enter an address") && (
                    <p className="text-xs sm:text-sm text-slate-400">
                        No offers found for this address.
                    </p>
                )}
            </div>
        </header>
    );
};
