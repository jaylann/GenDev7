/**
 * OfferListControls Module
 *
 * Provides UI controls for sorting, filtering, sharing, and toggling the view mode
 * of real estate offers. Delegates filter logic to OfferFilterPopover and communicates
 * user actions via provided callbacks.
 */
import React, { FC } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronDown, LayoutGrid, List, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SORT_OPTIONS } from "@/config/constants";
import { SortOptionKey } from "@/types/sort-option-key";
import { FiltersState } from "@/types/filters-state";
import { Offer } from "@/types/offer";
import { OfferFilterPopover } from "@/components/compare/offer-filter-popover";
import { ViewMode } from "@/types/view-mode";

/**
 * Props for OfferListControls component.
 *
 * @property sortOption - Current sorting key applied to offers.
 * @property onSortChange - Callback to change the sorting key.
 * @property viewMode - Current view mode: "grid" or "list".
 * @property onViewModeChange - Callback to switch between grid and list views.
 * @property onShare - Callback invoked when share button is pressed.
 * @property isShareDisabled - Disables share button when true.
 * @property sharedLinkCopied - Indicates the share link has been copied.
 * @property filters - Current filter state applied to the offers.
 * @property onFiltersChange - Callback to update the filter state.
 * @property activeFilterCount - Number of filters currently active.
 * @property originalOffers - Array of unfiltered offers for popover calculations.
 * @property isLoadingOffers - True when offers are loading; disables controls.
 * @property areAnyOffersLoaded - True if any offers have been loaded at all.
 * @property isSingleOfferView - Optional flag to disable certain controls in single-offer mode.
 */
interface OfferListControlsProps {
    sortOption: SortOptionKey;
    onSortChange: (key: SortOptionKey) => void;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    onShare: () => void;
    isShareDisabled: boolean;
    sharedLinkCopied: boolean;
    filters: FiltersState;
    onFiltersChange: (newFilters: FiltersState) => void;
    activeFilterCount: number;
    originalOffers: Offer[];
    isLoadingOffers: boolean; // For disabling controls during initial load
    areAnyOffersLoaded: boolean; // To disable controls if no offers at all
    isSingleOfferView?: boolean; // Add this
}

/**
 * Component for managing list controls: sorting, filtering, sharing, and view mode.
 */
export const OfferListControls: FC<OfferListControlsProps> = ({
    sortOption,
    onSortChange,
    viewMode,
    onViewModeChange,
    onShare,
    isShareDisabled,
    sharedLinkCopied,
    filters,
    onFiltersChange,
    activeFilterCount,
    originalOffers,
    isLoadingOffers,
    areAnyOffersLoaded,
    isSingleOfferView = false,
}) => {
    const currentSortOptionConfig = SORT_OPTIONS.find(
        (s) => s.key === sortOption,
    );
    const controlDisabled = isLoadingOffers && !areAnyOffersLoaded;

    return (
        <section className="flex flex-nowrap items-center justify-between space-x-2 px-2 py-2 w-full overflow-x-auto text-xs text-slate-300 border-y border-slate-700/50 sm:flex-wrap sm:justify-center sm:space-x-4 sm:gap-y-3 sm:px-0 sm:py-4 sm:text-sm sm:overflow-visible md:space-x-6">
            {/* Sort Dropdown: lets user choose an ordering for the offer list */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="text-slate-300 hover:text-white hover:bg-slate-700/50 px-1 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm"
                        disabled={controlDisabled || isSingleOfferView}
                    >
                        {currentSortOptionConfig?.icon &&
                            React.createElement(currentSortOptionConfig.icon, {
                                className: "mr-1 sm:mr-2 size-3 sm:size-4",
                            })}
                        <span className="hidden sm:inline">Sort: </span>
                        <span className="truncate max-w-[11ch] sm:max-w-none">
                            {currentSortOptionConfig?.label ?? "Select"}
                        </span>
                        <ChevronDown className="ml-1 sm:ml-2 size-3 sm:size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-slate-800 border-slate-700 text-slate-200 w-56">
                    {SORT_OPTIONS.map((option) => (
                        <DropdownMenuItem
                            key={option.key}
                            onClick={() => onSortChange(option.key)}
                            className={cn(
                                "focus:bg-slate-700 focus:text-white",
                                sortOption === option.key &&
                                    "bg-indigo-600/30 text-indigo-300",
                            )}
                        >
                            {option.icon && (
                                <option.icon className="mr-2 size-4" />
                            )}{" "}
                            {option.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Filter Popover: apply or clear filters on the offers */}
            <OfferFilterPopover
                appliedFilters={filters}
                onApplyFilters={onFiltersChange}
                originalOffers={originalOffers}
                isLoadingOffers={isLoadingOffers}
                activeFilterCount={activeFilterCount}
            />

            {/* Share Button: copy or generate a shareable link for the current view */}
            <Button
                variant="ghost"
                className="text-slate-300 hover:text-white hover:bg-slate-700/50 px-1 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm"
                onClick={onShare}
                disabled={isShareDisabled || sharedLinkCopied}
            >
                <Share2 className="mr-1 sm:mr-2 size-3 sm:size-4" />
                {sharedLinkCopied ? "Copied!" : "Share"}
            </Button>

            {/* View Mode Toggle: switch between grid and list layouts */}
            <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs sm:text-sm text-slate-400">View:</span>
                <ToggleGroup
                    type="single"
                    value={viewMode}
                    onValueChange={(v) => {
                        if (v) onViewModeChange(v as ViewMode);
                    }}
                    className="bg-slate-800/60 rounded-md p-0.5"
                    disabled={controlDisabled}
                >
                    <ToggleGroupItem
                        value="grid"
                        aria-label="Grid view"
                        className="data-[state=on]:bg-indigo-600 data-[state=on]:text-white text-slate-400 hover:bg-slate-700/50 hover:text-white px-2 py-0.5 sm:px-2.5 sm:py-1"
                    >
                        <LayoutGrid className="size-3 sm:size-4" />
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value="list"
                        aria-label="List view"
                        className="data-[state=on]:bg-indigo-600 data-[state=on]:text-white text-slate-400 hover:bg-slate-700/50 hover:text-white px-2 py-0.5 sm:px-2.5 sm:py-1"
                    >
                        <List className="size-3 sm:size-4" />
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>
        </section>
    );
};
