// app/compare/components/PageHeader.tsx
import React, { FC } from 'react';
import { AlertCircle } from 'lucide-react';
import {GOOGLE_MAPS_API_KEY_FROM_ENV} from "@/config/constants";

interface PageHeaderProps {
    statusMessage: string;
}

/**
 * Displays the main page header, title, and status messages including API key warnings.
 * @param statusMessage - The current operational status message to display.
 */
export const PageHeader: FC<PageHeaderProps> = ({ statusMessage }) => {
    const hasApiKey = !!GOOGLE_MAPS_API_KEY_FROM_ENV;

    return (
        <header className="text-center space-y-2">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
                Compare Internet Providers
            </h1>
            {!hasApiKey && (
                <p className="text-sm text-red-400 flex items-center justify-center gap-2">
                    <AlertCircle className="size-4" />
                    Google Maps API Key missing. Address search is disabled.
                </p>
            )}
            {statusMessage && <p className="text-sm text-slate-400 min-h-[20px]">{statusMessage}</p>}
        </header>
    );
};