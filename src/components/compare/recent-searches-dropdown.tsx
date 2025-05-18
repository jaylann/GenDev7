/**
 * RecentSearchesDropdown Module
 *
 * Provides a UI for displaying and navigating recent address searches.
 * Includes options to select a past search or clear the history.
 */
import React, { FC } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { History, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { RecentSearchItem } from "@/hooks/use-recent-searches";

interface RecentSearchesDropdownProps {
    searches: RecentSearchItem[];
    onClear: () => void;
    className?: string; // For positioning wrapper
}

/**
 * A dropdown menu component to display and navigate to recent searches.
 * @param searches - Array of recent search items.
 * @param onClear - Callback function to clear recent searches.
 * @param className - Optional className for the root div for positioning.
 */
export const RecentSearchesDropdown: FC<RecentSearchesDropdownProps> = ({
    searches,
    onClear,
    className,
}) => {
    const router = useRouter();

    // Navigate to the selected recent search URL when an item is clicked
    const handleSelectSearch = (url: string) => {
        // The URL stored in recentSearches is the relative path with query params (e.g., /compare?slug=...)
        router.push(url);
    };

    // If there are no recent searches, do not render the dropdown component
    if (searches.length === 0) {
        return null;
    }

    return (
        <div className={cn(className)}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    {/* Trigger button with history icon that opens the recent searches dropdown */}
                    <Button
                        variant="ghost" // Changed variant
                        size="icon"
                        className={cn(
                            "rounded-full size-10 text-slate-400 hover:text-indigo-300 hover:bg-slate-700/70", // Adjusted styling
                            "focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900", // Focus styling
                        )}
                    >
                        <History className="h-5 w-5" />
                        <span className="sr-only">View Recent Searches</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    className="w-72 bg-slate-800/95 backdrop-blur-sm border-slate-700 text-slate-200 shadow-2xl" // Added backdrop-blur for style
                    align="end"
                    sideOffset={10}
                >
                    <DropdownMenuLabel className="text-slate-100 font-semibold px-3 py-2">
                        Recent Searches
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-slate-700/80" />
                    {searches.map((search) => (
                        <DropdownMenuItem
                            key={search.id}
                            onClick={() => handleSelectSearch(search.url)}
                            className="focus:bg-indigo-600/30 focus:text-indigo-200 text-sm cursor-pointer px-3 py-2"
                        >
                            <span
                                className="truncate block"
                                title={search.label}
                            >
                                {search.label}
                            </span>
                        </DropdownMenuItem>
                    ))}
                    {searches.length > 0 && (
                        <>
                            <DropdownMenuSeparator className="bg-slate-700/80" />
                            <DropdownMenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClear();
                                }}
                                className="text-red-400 hover:!text-red-300 focus:!bg-red-500/30 focus:!text-red-300 text-xs px-3 py-2"
                            >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Clear History
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
