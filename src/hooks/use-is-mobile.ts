/**
 * useIsMobile Hook Module
 *
 * Provides a React hook that determines if the current viewport width
 * falls below a specified breakpoint, indicating a mobile view.
 * Listens to window resize events and updates the state accordingly.
 */
import { useEffect, useState } from "react";

/**
 * Custom hook to detect if the viewport width is below the given breakpoint.
 *
 * @param breakpoint Width in pixels to differentiate mobile view (default: 640).
 * @returns boolean indicating if current view is mobile.
 */
export function useIsMobile(breakpoint = 640) {
    // State to track whether the viewport currently matches "mobile" criteria
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        // Effect: register resize listener to update mobile status
        // Handler to set isMobile true if viewport width is less than breakpoint
        const onResize = () => setIsMobile(window.innerWidth < breakpoint);
        // Trigger initial check
        onResize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [breakpoint]);
    return isMobile;
}