/**
 * Formats a numeric value in cents into a Euro currency string.
 * @param cents - The amount in cents, or null/undefined.
 * @returns The formatted currency string (e.g., "€25.99") or "–" if input is null/undefined.
 */
export const formatEur = (cents: number | null | undefined): string => {
    if (cents == null) {
        return '–';
    }
    return new Intl.NumberFormat('de-DE', {
        style: 'currency', currency: 'EUR',
    }).format(cents / 100);
};