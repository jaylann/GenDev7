/**
 * Custom React hook to detect and track mobile view based on viewport width.
 * Listens to window resize events and updates state.
 */
import { useEffect, useState } from "react";

/**
 * Hook to determine if the viewport width is below a specified breakpoint.
 *
 * @param breakpoint - Pixel width threshold to classify mobile view (default: 640).
 * @returns True if current viewport width is less than the breakpoint.
 */
export function useIsMobile(breakpoint = 640) {
    const [isMobile, setIsMobile] = useState(false);

    /**
     * Registers window resize listener, performs initial status check, and cleans up on unmount.
     */
    useEffect(() => {
        /**
         * Updates mobile status based on current window width.
         */
        const onResize = () => setIsMobile(window.innerWidth < breakpoint);
        onResize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [breakpoint]);
    return isMobile;
}
