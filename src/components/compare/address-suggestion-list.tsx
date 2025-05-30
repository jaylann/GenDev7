/**
 * AddressSuggestionsList Module
 *
 * Renders the dropdown list with keyboard-highlight support.
 */
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import React, { forwardRef, ReactNode } from "react";

interface AddressSuggestionsListProps {
    show: boolean;
    suggestions: import("use-places-autocomplete").Suggestions;
    highlightedIndex: number;
    onSelect: (desc: string) => void;
}

interface StatusBoxProps {
    children: ReactNode;
    error?: boolean;
}

const StatusBox: React.FC<StatusBoxProps> = ({ children, error }) => (
    <div
        className={cn(
            "absolute z-20 mt-1 w-full rounded-md border px-3 py-2 text-sm shadow-lg",
            error
                ? "border-red-700 bg-red-900/50 text-red-400"
                : "border-slate-700 bg-slate-900 text-slate-400",
        )}
    >
        {children}
    </div>
);

/**
 * Forward ref so the parent can detect outside-clicks and
 * manage scrollIntoView if desired.
 */
export const AddressSuggestionsList = forwardRef<
    HTMLUListElement,
    AddressSuggestionsListProps
>(function AddressSuggestionsList(
    {
        show,
        suggestions: { status, data, loading },
        highlightedIndex,
        onSelect,
    },
    ref,
) {
    if (!show) return null;

    if (loading)
        return (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-slate-400" />
        );

    if (status === "OK" && data.length > 0)
        return (
            <ul
                ref={ref}
                className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-700 bg-slate-800/95 backdrop-blur-sm shadow-lg"
                role="listbox"
            >
                {data.map(
                    ({ place_id, description, structured_formatting }, idx) => {
                        const highlighted = idx === highlightedIndex;
                        return (
                            <li
                                key={place_id}
                                id={`addr-opt-${idx}`}
                                onMouseDown={(e) => e.preventDefault()} // keep input focus
                                onClick={() => onSelect(description)}
                                className={cn(
                                    "cursor-pointer px-4 py-2.5 text-sm",
                                    highlighted
                                        ? "bg-indigo-600 text-white"
                                        : "text-slate-200 hover:bg-indigo-600 hover:text-white",
                                )}
                                role="option"
                                aria-selected={highlighted}
                            >
                                <strong>
                                    {structured_formatting.main_text}
                                </strong>{" "}
                                <small className="text-slate-400">
                                    {structured_formatting.secondary_text}
                                </small>
                            </li>
                        );
                    },
                )}
            </ul>
        );

    if (status === "ZERO_RESULTS")
        return <StatusBox>No matching addresses found.</StatusBox>;

    if (status === "REQUEST_DENIED")
        return (
            <StatusBox error>
                Autocomplete error: REQUEST_DENIED (check API key &amp; quotas).
            </StatusBox>
        );

    if (status && status !== "OK")
        return <StatusBox>{`Autocomplete status: ${status}.`}</StatusBox>;

    return null;
});
