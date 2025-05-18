/**
 * AddressSuggestionsList Module
 *
 * Provides UI for displaying location autocomplete suggestions.
 * Handles loading state, successful suggestions, zero results, and error statuses.
 * Delegates selection events to the parent via the onSelect callback.
 */
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import React, { ReactNode } from "react";

/**
 * Props for AddressSuggestionsList component.
 *
 * @property show - Whether to display the suggestions list.
 * @property suggestions - Suggestions object from use-places-autocomplete containing status, data, and loading flag.
 * @property onSelect - Callback invoked with the description when a suggestion is clicked.
 */
interface AddressSuggestionsListProps {
    show: boolean;
    suggestions: import("use-places-autocomplete").Suggestions;
    onSelect: (desc: string) => void;
}

/**
 * Props for StatusBox component.
 *
 * @property children - Content to display inside the status box.
 * @property error - If true, renders the box in an error style.
 */
interface StatusBoxProps {
    children: ReactNode;
    error?: boolean;
}

/**
 * StatusBox displays a bordered container for messages.
 *
 * Renders with error styling if the error prop is true, otherwise uses normal styling.
 */
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
 * AddressSuggestionsList component renders autocomplete suggestions for addresses.
 *
 * It returns:
 *  - null if show is false.
 *  - A loading spinner when suggestions.loading is true.
 *  - A list of suggestions when status is "OK" and data is non-empty.
 *  - A StatusBox with appropriate message for no results or errors.
 *
 * @returns ReactNode
 */
export const AddressSuggestionsList: React.FC<AddressSuggestionsListProps> = ({
    show,
    suggestions: { status, data, loading },
    onSelect,
}) => {
    // Do not render anything when dropdown is hidden
    if (!show) return null;

    // Render loading spinner while suggestions are being fetched
    if (loading)
        return (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-slate-400" />
        );

    // Render list of address suggestions on successful fetch
    if (status === "OK" && data.length > 0)
        return (
            <ul
                className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-700 bg-slate-800/95 backdrop-blur-sm shadow-lg"
                role="listbox"
            >
                {data.map(
                    ({ place_id, description, structured_formatting }) => (
                        <li
                            key={place_id}
                            onMouseDown={(e) => e.preventDefault()} // keep input focus
                            onClick={() => onSelect(description)}
                            className="cursor-pointer px-4 py-2.5 text-sm text-slate-200 hover:bg-indigo-600 hover:text-white"
                            role="option"
                            aria-selected={false}
                        >
                            <strong>{structured_formatting.main_text}</strong>{" "}
                            <small className="text-slate-400">
                                {structured_formatting.secondary_text}
                            </small>
                        </li>
                    ),
                )}
            </ul>
        );

    // No suggestions found for the query
    if (status === "ZERO_RESULTS")
        return <StatusBox>No matching addresses found.</StatusBox>;

    // API key error or quotas exceeded
    if (status === "REQUEST_DENIED")
        return (
            <StatusBox error>
                Autocomplete error: REQUEST_DENIED (check API key &amp; quotas).
            </StatusBox>
        );

    // Other non-success statuses
    if (status && status !== "OK")
        return <StatusBox>{`Autocomplete status: ${status}.`}</StatusBox>;

    return null;
};
