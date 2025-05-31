/**
 * Custom React hook that invokes a callback when a mousedown event occurs outside of specified elements.
 *
 * Useful for closing dropdowns, modals, or tooltips when the user interacts outside the component.
 *
 * @param refs - Array of RefObject<HTMLElement> to monitor for outside click events.
 * @param onOutside - Callback invoked when a click is detected outside all provided refs.
 */
import { useEffect, type RefObject } from "react";

export const useOutsideClick = (
    refs: RefObject<HTMLElement | null>[],
    onOutside: () => void,
): void => {
    useEffect(() => {
        /**
         * Document mousedown event listener.
         * Invokes onOutside if the event target lies outside all monitored elements.
         */
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
