/**
 * Enterprise-grade React hook that monitors the viewport width to determine mobile context.
 * It registers a window resize listener and maintains responsive state.
 */
import { useEffect, useState } from "react";

/**
 * Evaluates whether the viewport width is below the specified mobile breakpoint.
 *
 * @param breakpoint The pixel width threshold to define mobile view (default: 640).
 * @returns A boolean indicating if the viewport width is less than the breakpoint.
 */
export function useIsMobile(breakpoint = 640) {
    const [isMobile, setIsMobile] = useState(false);

    /**
     * Initializes the window resize listener, performs an initial evaluation,
     * and ensures cleanup on component unmount.
     */
    useEffect(() => {
        /**
         * Checks the current window width against the breakpoint and updates the state.
         */
        const onResize = () => setIsMobile(window.innerWidth < breakpoint);
        onResize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [breakpoint]);
    return isMobile;
}
