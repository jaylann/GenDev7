// app/compare/components/OfferListControls.tsx
import React, {FC} from 'react';
import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,} from '@/components/ui/dropdown-menu';
import {ToggleGroup, ToggleGroupItem} from "@/components/ui/toggle-group";
import {ChevronDown, LayoutGrid, List, Share2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {SORT_OPTIONS} from "@/config/constants";
import {SortOptionKey} from "@/types/sort-option-key";
import {FiltersState} from "@/types/filters-state";
import {Offer} from "@/types/offer";
import {OfferFilterPopover} from "@/components/compare/offer-filter-popover";


export type ViewMode = 'grid' | 'list';

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
    const currentSortOptionConfig = SORT_OPTIONS.find(s => s.key === sortOption);
    const controlDisabled = isLoadingOffers && !areAnyOffersLoaded;

    return (<section
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 md:gap-x-6 text-sm text-slate-300 border-y border-slate-700/50 py-4">
        {/* Sort Dropdown */}
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    className="text-slate-300 hover:text-white hover:bg-slate-700/50 px-3 py-1.5"
                    disabled={controlDisabled || isSingleOfferView}
                >
                    {currentSortOptionConfig?.icon && React.createElement(currentSortOptionConfig.icon, {className: "mr-2 size-4"})}
                    Sort: {currentSortOptionConfig?.label ?? 'Select'}
                    <ChevronDown className="ml-2 size-4"/>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-slate-800 border-slate-700 text-slate-200 w-56">
                {SORT_OPTIONS.map(option => (<DropdownMenuItem
                    key={option.key}
                    onClick={() => onSortChange(option.key)}
                    className={cn("focus:bg-slate-700 focus:text-white", sortOption === option.key && "bg-indigo-600/30 text-indigo-300")}
                >
                    {option.icon && <option.icon className="mr-2 size-4"/>} {option.label}
                </DropdownMenuItem>))}
            </DropdownMenuContent>
        </DropdownMenu>

        {/* Filter Popover */}
        <OfferFilterPopover
            appliedFilters={filters}
            onApplyFilters={onFiltersChange}
            originalOffers={originalOffers}
            isLoadingOffers={isLoadingOffers}
            activeFilterCount={activeFilterCount}
        />

        {/* Share Button */}
        <Button
            variant="ghost"
            className="text-slate-300 hover:text-white hover:bg-slate-700/50 px-3 py-1.5"
            onClick={onShare}
            disabled={isShareDisabled || sharedLinkCopied}
        >
            <Share2 className="mr-2 size-4"/>
            {sharedLinkCopied ? 'Copied!' : 'Share'}
        </Button>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
            <span className="text-slate-400">View:</span>
            <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => {
                    if (v) onViewModeChange(v as ViewMode);
                }}
                className="bg-slate-800/60 rounded-md p-0.5"
                disabled={controlDisabled}
            >
                <ToggleGroupItem value="grid" aria-label="Grid view"
                                 className="data-[state=on]:bg-indigo-600 data-[state=on]:text-white text-slate-400 hover:bg-slate-700/50 hover:text-white px-2.5 py-1">
                    <LayoutGrid className="size-4"/>
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List view"
                                 className="data-[state=on]:bg-indigo-600 data-[state=on]:text-white text-slate-400 hover:bg-slate-700/50 hover:text-white px-2.5 py-1">
                    <List className="size-4"/>
                </ToggleGroupItem>
            </ToggleGroup>
        </div>
    </section>);
};