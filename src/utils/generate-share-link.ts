// API service for generating share link
import { API_BASE_URL } from "@/config/constants";

export async function generateShareLink(
    original_page_slug: string,
    offer_key: string,
): Promise<{ shared_slug: string }> {
    const response = await fetch(`${API_BASE_URL}/offers/share-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_page_slug, offer_key }),
    });
    if (!response.ok) {
        const errorData = await response
            .json()
            .catch(() => ({ detail: "Failed to generate share link." }));
        throw new Error(errorData.detail || "Failed to generate share link.");
    }
    return response.json();
}
