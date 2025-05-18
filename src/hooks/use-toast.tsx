"use client";

import * as React from "react";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

export function Toaster() {
    return (
        <SonnerToaster
            position="bottom-center"
            richColors
            // bump it above everything else
            toastOptions={{
                className:
                    "motion-safe:animate-slide-in bg-[#1C203C] text-slate-200 shadow-lg",
                classNames: {
                    success: "bg-indigo-600 text-white",
                    error: "bg-red-600 text-white",
                    loading: "bg-slate-600 text-white",
                },
            }}
        />
    );
}

/**
 * Returns a `toast()` function you can call anywhere in your client code.
 */
export function useToast() {
    // we memoize so components don’t re-render unnecessarily
    return React.useMemo(() => ({ toast: sonnerToast }), []);
}
