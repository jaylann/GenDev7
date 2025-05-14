import { NextRequest, NextResponse } from 'next/server';
import {Offer} from "@/types/offer";

/**
 * @file app/api/get-shared-offers/route.ts
 * @description API route to fetch shared comparison offers by slug.
 * This route acts as a proxy to the backend to avoid exposing the backend URL
 * directly to the client and to handle potential CORS issues.
 */

/**
 * The base URL of the backend API.
 * It attempts to read from the `API_URL` environment variable,
 * falling back to a default for local development.
 * This should be the URL of your Python FastAPI backend.
 */
const BACKEND_API_URL = process.env.API_URL?.trim() || 'http://localhost:8000';

/**
 * Handles GET requests to `/api/get-shared-offers`.
 * Expects a `slug` query parameter.
 * Fetches offer data associated with the slug from the backend.
 *
 * @param request - The incoming Next.js request object.
 * @returns A NextResponse object with the offer data or an error message.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (!slug) {
        return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    try {
        const backendUrl = `${BACKEND_API_URL}/compare/${slug}`;
        const response = await fetch(backendUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                // Add any other necessary headers for your backend, e.g., an API key if globally required
            },
            // Configure caching as per Next.js fetch API.
            // 'no-store' ensures it always hits the backend, which has its own cache.
            // Use this if backend cache is the source of truth and might update frequently.
            cache: 'no-store',
        });

        if (!response.ok) {
            let errorData: { detail?: string } = {};
            try {
                errorData = await response.json();
            } catch (e) {
                // If parsing error JSON fails, use a generic message
                errorData = { detail: `Backend responded with ${response.status}, but error details are unavailable.` };
            }
            console.error(`Error fetching slug ${slug} from backend: ${response.status}`, errorData);
            return NextResponse.json({ error: errorData.detail || `Backend returned status ${response.status}` }, { status: response.status });
        }

        // Assuming the backend returns data in the shape: { slug: string, offers: Offer[] }
        const data: { slug: string; offers: Offer[] } = await response.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error(`Error in /api/get-shared-offers for slug ${slug}:`, error);
        // Provide a generic error message to the client
        return NextResponse.json({ error: 'Internal server error occurred while fetching shared offers.', details: error.message }, { status: 500 });
    }
}