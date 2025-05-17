// components/TopBar.tsx
import React from "react";

export interface TopBarProps {
    /**
     * Anything you want rendered inside the TopBar
     * (e.g. logo, nav links, action buttons).
     */
    children: React.ReactNode;
}

/**
 * A glass‐effect top bar that sits under the iOS status bar.
 *
 * - Uses `backdrop-filter: blur(...)` for the frosted‐glass look.
 * - Background color with alpha (.bg-white/30 or dark:bg-black/30).
 * - Applies safe‐area inset for the notch/status‐bar.
 */
export const TopBar: React.FC<TopBarProps> = ({ children }) => {
    return (
        <header
            className="
        fixed inset-x-0
        top-0
        z-50
        backdrop-blur-md
        bg-white/30 dark:bg-black/30
        "
            style={{
                // ensure content sits below iOS notch / status‐bar
                paddingTop: "env(safe-area-inset-top)",
            }}
        >
            <div className="max-w-screen-lg mx-auto px-4 py-2">
                {children}
            </div>
        </header>
    );
};
