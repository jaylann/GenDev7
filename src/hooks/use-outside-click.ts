import { useEffect, type RefObject } from 'react';

/** Fires `onOutside` whenever a click happens outside **all** provided refs. */
export const useOutsideClick = <T extends HTMLElement = HTMLElement>(
    refs: RefObject<T | null>[],
    onOutside: () => void,
): void => {
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (refs.every((r) => !r.current?.contains(e.target as Node))) {
                onOutside();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => {
            document.removeEventListener('mousedown', handler);
        };
    }, [refs, onOutside]);
};
