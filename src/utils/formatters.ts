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

/**
 * Generates a display string for data capacity.
 * @param dataCapGb - The data cap in GB. Null or undefined means unlimited.
 * @returns A string like "500 GB" or "Unlimited Data".
 */
export const formatDataCap = (dataCapGb?: number | null): string => {
    if (dataCapGb == null || dataCapGb <= 0) {
        return "Unlimited Data";
    }
    return `${dataCapGb} GB`;
};