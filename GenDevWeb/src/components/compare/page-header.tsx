/****
 * PageHeader Module
 *
 * Renders the header of the comparison page including the title,
 * an API key warning if necessary, and operational status messages.
 */
import React, { FC } from "react";
import { AlertCircle } from "lucide-react";
import { GOOGLE_MAPS_API_KEY_FROM_ENV } from "@/config/constants";

interface PageHeaderProps {
    statusMessage: string;
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
export const PageHeader: FC<PageHeaderProps> = ({ statusMessage }) => {
    // Determine if a Google Maps API key is provided
    const hasApiKey = !!GOOGLE_MAPS_API_KEY_FROM_ENV;

    return (
        <header className="text-center px-4 py-2 space-y-1 sm:space-y-2 md:px-0">
            {/* Main title for the comparison page */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white">
                Compare Internet Providers
            </h1>
            {/* Show warning if no Google Maps API key is available */}
            {!hasApiKey && (
                <p className="text-xs sm:text-sm text-red-400 flex items-center justify-center gap-1">
                    <AlertCircle className="size-4" />
                    Google Maps API Key missing. Address search is disabled.
                </p>
            )}
            {/* Display the status message if provided */}
            {statusMessage && (
                <p className="text-xs sm:text-sm text-slate-400 min-h-[20px]">
                    {statusMessage}
                </p>
            )}
        </header>
    );
};
