/****
 * useOutsideClick Hook
 *
 * Invokes a callback when a mouse down event occurs outside all specified element references.
 * Useful for closing dropdowns, modals, or tooltips when clicking elsewhere on the page.
 */
import { useEffect, type RefObject } from "react";

/**
 * Fires `onOutside` whenever a click happens outside all provided element refs.
 *
 * @param refs - Array of refs to monitor for outside clicks.
 * @param onOutside - Callback executed when a click is detected outside all refs.
 */
export const useOutsideClick = (
    refs: RefObject<HTMLElement | null>[],  // accept any HTMLElement refs
    onOutside: () => void,
): void => {
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (refs.every((r) => !r.current?.contains(e.target as Node))) {
                onOutside();
            }
        };
        document.addEventListener("mousedown", handler);
        return () => {
            document.removeEventListener("mousedown", handler);
        };
    }, [refs, onOutside]);
};

