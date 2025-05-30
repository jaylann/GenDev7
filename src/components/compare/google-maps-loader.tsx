/**
 * GoogleMapsLoader Module
 *
 * Ensures the Google Maps JavaScript SDK is loaded once per application.
 * Should be rendered at a high level (e.g. _app.tsx or layout.tsx).
 */
"use client";
import Script from "next/script";
import React from "react";
import { logger } from "@/utils/logger";

/**
 * GoogleMapsLoader component dynamically injects the Google Maps SDK script.
 *
 * Checks for the NEXT_PUBLIC_GOOGLE_MAPS_API_KEY environment variable.
 * - If missing (in development), logs an error and disables the SDK.
 * - If present, loads the Maps API with the Places library asynchronously.
 *
 * @returns JSX.Element | null
 */
export const GoogleMapsLoader: React.FC = () => {
    // Retrieve the public API key for Google Maps from environment variables
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        // If the API key is not set, log an error in development and skip loading the SDK
        if (process.env.NODE_ENV === "development") {
            logger.error(
                "GoogleMapsLoader",
                "❌ Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY – Google SDK disabled."
            );
        }
        return null;
    }

    // Load the Google Maps SDK script asynchronously after the page is interactive
    return (
        <Script
            id="google-maps-sdk"
            src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`}
            strategy="afterInteractive"
            async
            onError={(e) => logger.error("GoogleMapsLoader", "Failed to load Google Maps SDK", e)}
        />
    );
};
