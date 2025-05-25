/**
 * RecentSearchesDropdown
 *
 * Disabled-state support: if the slug in a recent-search URL is identical
 * to the slug currently shown in the UI, the entry is greyed-out and the
 * click handler short-circuits — we never call router.push().
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
import type { RecentSearchItem } from "@/types/recent-search-item";

interface RecentSearchesDropdownProps {
    searches: RecentSearchItem[];
    onClear: () => void;
    /** Currently-displayed slug (or null when no slug yet) */
    currentSlug: string | null;
    className?: string;
}

/**
 * Extract ?slug=… from a stored recent-search URL.
 * Returns null when no slug param is present.
 */
const extractSlug = (url: string): string | null => {
    try {
        return new URL(url, window.location.origin).searchParams.get("slug");
    } catch {
        return null;
    }
};

export const RecentSearchesDropdown: FC<RecentSearchesDropdownProps> = ({
                                                                            searches,
                                                                            onClear,
                                                                            currentSlug,
                                                                            className,
                                                                        }) => {
    const router = useRouter();

    const handleSelectSearch = (url: string) => {
        const slugOfTarget = extractSlug(url);

        /** 🔒 Block navigation when the target slug equals the current one */
        if (slugOfTarget === currentSlug) return;

        router.push(url, { scroll: false });
    };

    if (searches.length === 0) return null;

    return (
        <div className={cn(className)}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "rounded-full size-10 text-slate-400 hover:text-indigo-300 hover:bg-slate-700/70",
                            "focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
                        )}
                    >
                        <History className="h-5 w-5" />
                        <span className="sr-only">View Recent Searches</span>
                    </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                    className="w-72 bg-slate-800/95 backdrop-blur-sm border-slate-700 text-slate-200 shadow-2xl"
                    align="end"
                    sideOffset={10}
                >
                    <DropdownMenuLabel className="text-slate-100 font-semibold px-3 py-2">
                        Recent Searches
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-slate-700/80" />

                    {searches.map((search) => {
                        const slugOfItem = extractSlug(search.url);
                        const isCurrent = slugOfItem === currentSlug;

                        return (
                            <DropdownMenuItem
                                key={search.id}
                                disabled={isCurrent}
                                onClick={() => handleSelectSearch(search.url)}
                                className={cn(
                                    "text-sm px-3 py-2 truncate",
                                    isCurrent
                                        ? "opacity-50 cursor-not-allowed"
                                        : "cursor-pointer focus:bg-indigo-600/30 focus:text-indigo-200",
                                )}
                                title={search.label}
                            >
                                <span
                                    className="truncate block"
                                    title={search.label}
                                >
                                {search.label}
                            </span>
                            </DropdownMenuItem>
                        );
                    })}

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
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
