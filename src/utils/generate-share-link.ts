/****
 * Share Link Generator Module
 *
 * Provides functionality to create shareable links for real estate offers.
 * Exports:
 *  - generateShareLink: Sends a request to the backend to generate a share slug.
 */

/**
 * Generates a shareable slug for a given offer.
 *
 * @param original_page_slug - The slug identifying the original comparison page.
 * @param offer_key - The unique key of the offer to share.
 * @returns A promise resolving to an object containing the `shared_slug`.
 * @throws Error if the request fails or the response is not OK.
 */
export async function generateShareLink(
    original_page_slug: string,
    offer_key: string,
): Promise<{ shared_slug: string }> {
    // Send POST request to backend to generate a share link
    const response = await fetch(`https://lizard-lucky-unlikely.ngrok-free.app/offers/share-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_page_slug, offer_key }),
    });
    // Check for HTTP errors in the response
    if (!response.ok) {
        // Attempt to parse error details, fallback to a generic message on parse failure
        const errorData = await response
            .json()
            .catch(() => ({ detail: "Failed to generate share link." }));
        throw new Error(errorData.detail || "Failed to generate share link.");
    }
    // Parse and return the successful response JSON containing `shared_slug`
    return response.json();
}
