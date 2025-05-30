"use client";

import React, { FC } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import type { RecentSearchItem } from "@/types/recent-search-item";
import { extractSlug } from "@/utils/url";

interface RecentSearchesDropdownProps {
    /** Array of recent search items to display. */
    searches: RecentSearchItem[];
    /** Callback function invoked when the "Clear History" action is triggered. */
    onClear: () => void;
    /** Optional CSS class name for custom styling of the root dropdown element. */
    className?: string;
}

const isUrlEffectivelyEqualToCurrent = (
    itemUrl: string,
    _currentPathname: string,
    currentBrowserParams: URLSearchParams,
): boolean => extractSlug(itemUrl) === currentBrowserParams.get("slug"); // ignore pathname entirely
/**
 * Renders a dropdown menu displaying recently visited search pages.
 * Allows users to quickly navigate back to previous searches or clear their search history.
 * An item is disabled if its URL exactly matches the current page's URL (pathname and all query parameters).
 */
export const RecentSearchesDropdown: FC<RecentSearchesDropdownProps> = ({
    searches,
    onClear,
    className,
}) => {
    const router = useRouter();
    const currentPathname = usePathname();
    const currentSearchParams = useSearchParams(); // ReadonlyURLSearchParams

    const memoizedCurrentBrowserParams = React.useMemo(() => {
        return new URLSearchParams(currentSearchParams.toString());
    }, [currentSearchParams]);

    if (searches.length === 0) {
        return null; // Don't render anything if there are no recent searches.
    }

    return (
        <div className={cn("relative", className)}>
            {" "}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "rounded-full size-10 text-slate-400 transition-colors duration-150 ease-in-out",
                            "hover:text-indigo-300 hover:bg-slate-700/70",
                            "focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
                        )}
                        aria-label="Open recent searches"
                    >
                        <History className="h-5 w-5" />
                        <span className="sr-only">View Recent Searches</span>
                    </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                    className="w-72 bg-slate-800/95 backdrop-blur-sm border-slate-700 text-slate-200 shadow-2xl"
                    align="end"
                    sideOffset={10} // Space between trigger and content
                >
                    <DropdownMenuLabel className="text-slate-100 font-semibold px-3 py-2">
                        Recent Searches
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-slate-700/80" />

                    {searches.map((search) => {
                        const isCurrentItem = isUrlEffectivelyEqualToCurrent(
                            search.url,
                            currentPathname,
                            memoizedCurrentBrowserParams,
                        );

                        return (
                            <DropdownMenuItem
                                key={search.id}
                                disabled={isCurrentItem}
                                onClick={() => {
                                    // Navigation is primarily handled by router.push.
                                    // The 'disabled' prop should prevent onClick if item is current.
                                    // This check is a logical safeguard.
                                    if (!isCurrentItem) {
                                        router.push(search.url, {
                                            scroll: false,
                                        });
                                    }
                                }}
                                className={cn(
                                    "text-sm px-3 py-2 truncate transition-colors duration-150 ease-in-out",
                                    isCurrentItem
                                        ? "opacity-50 cursor-not-allowed text-slate-400"
                                        : "cursor-pointer text-slate-200 hover:!bg-indigo-600/30 hover:!text-indigo-100 focus:bg-indigo-600/30 focus:text-indigo-100",
                                )}
                                title={search.label} // Provide full label as tooltip for truncated text
                            >
                                <span
                                    className="truncate block"
                                >
                                    {search.label}
                                </span>
                            </DropdownMenuItem>
                        );
                    })}

                    {/* Ensure there's a separator only if there are items */}
                    {searches.length > 0 && (
                        <DropdownMenuSeparator className="bg-slate-700/80" />
                    )}

                    <DropdownMenuItem
                        onClick={() => {
                            onClear();
                        }}
                        className={cn(
                            "text-xs px-3 py-2 cursor-pointer transition-colors duration-150 ease-in-out",
                            "text-red-400 hover:!text-red-300 focus:!bg-red-500/30 focus:!text-red-300",
                        )}
                    >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Clear History
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
