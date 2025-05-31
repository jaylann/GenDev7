"use client";

import { useCallback } from "react";
import { toast as sonnerToast } from "sonner";

/**
 * Hook for managing toast notifications with sanitized content
 * @returns Object containing notification utilities
 */
export function useNotifications() {
    /**
     * Sanitizes text by replacing HTML-sensitive characters
     */
    const sanitizeText = useCallback((text: string): string => {
        return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }, []);

    /**
     * Creates a toast notification with sanitized text content
     */
    const notify = useCallback(
        (text: string, duration = 3000) => {
            // No HTML allowed in text - we display as plain text only
            const sanitizedText = sanitizeText(text);
            return sonnerToast(
                // Use text content only, no HTML interpretation
                <p className="text-white">{sanitizedText}</p>,
                { duration, id: `toast-${Date.now()}` },
            );
        },
        [sanitizeText],
    );

    return { notify, sanitizeText };
}
