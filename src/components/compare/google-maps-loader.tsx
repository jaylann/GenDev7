'use client';
import Script from 'next/script';

/**
 * Loads the Google Maps JS SDK once per application.
 * Render this high in the tree (e.g. `_app.tsx` or `layout.tsx`).
 */
export const GoogleMapsLoader: React.FC = () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        if (process.env.NODE_ENV === 'development') {
            console.error('❌ Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY – Google SDK disabled.');
        }
        return null;
    }

    return (
        <Script
            id="google-maps-sdk"
            src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`}
            strategy="afterInteractive"
            async
            onError={(e) => console.error('Failed to load Google Maps SDK', e)}
        />
    );
};
