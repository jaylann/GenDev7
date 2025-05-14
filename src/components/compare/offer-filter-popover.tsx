// app/compare/components/OfferFilterPopover.tsx
import React, { FC, useState, useEffect, useMemo } from 'react';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SlidersHorizontal, X as XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {FiltersState} from "@/types/filters-state";
import {Offer} from "@/types/offer";
import {
    AVAILABLE_CONNECTION_TYPES,
    AVAILABLE_CONTRACT_DURATIONS,
    DEFAULT_FILTERS,
    MAX_SPEED_FALLBACK,
    MIN_SPEED_SLIDER_FLOOR
} from "@/config/constants";

interface OfferFilterPopoverProps {
    appliedFilters: FiltersState;
    onApplyFilters: (newFilters: FiltersState) => void;
    originalOffers: Offer[]; // To derive unique providers, durations, maxSpeed
    isLoadingOffers: boolean; // To show skeletons for providers
    activeFilterCount: number;
}

/**
 * Popover component for filtering internet offers.
 * Manages draft filter state internally and applies them on confirmation.
 */
export const OfferFilterPopover: FC<OfferFilterPopoverProps> = ({
                                                                    appliedFilters,
                                                                    onApplyFilters,
                                                                    originalOffers,
                                                                    isLoadingOffers,
                                                                    activeFilterCount,
                                                                }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [draftFilters, setDraftFilters] = useState<FiltersState>(appliedFilters);

    // Sync draft filters if appliedFilters change externally (e.g., from URL or reset)
    useEffect(() => {
        setDraftFilters(appliedFilters);
    }, [appliedFilters]);

    const handleDraftFilterChange = <K extends keyof FiltersState>(
        filterKey: K,
        value: FiltersState[K]
    ) => {
        setDraftFilters(prev => ({ ...prev, [filterKey]: value }));
    };

    const handleApply = () => {
        onApplyFilters(draftFilters);
        setIsOpen(false);
    };

    const handleReset = () => {
        setDraftFilters(DEFAULT_FILTERS);
        // Optionally, apply reset immediately:
        // onApplyFilters(DEFAULT_FILTERS);
        // setIsOpen(false);
    };

    const uniqueProviders = useMemo(() => Array.from(new Set(originalOffers.map(o => o.provider))).sort(), [originalOffers]);
    const uniqueContractDurations = useMemo(() => Array.from(new Set(originalOffers.map(o => o.contract_duration_months))).sort((a, b) => a - b), [originalOffers]);
    const maxSpeedAvailable = useMemo(() => {
        if (originalOffers.length === 0) return MAX_SPEED_FALLBACK;
        return Math.max(...originalOffers.map(o => o.speed_down_mbit), MIN_SPEED_SLIDER_FLOOR);
    }, [originalOffers]);


    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    className="text-slate-300 hover:text-white hover:bg-slate-700/50 px-3 py-1.5 relative"
                    disabled={isLoadingOffers && originalOffers.length === 0}
                >
                    <SlidersHorizontal className="mr-2 size-4" /> Filters
                    {activeFilterCount > 0 && (
                        <Badge
                            variant="destructive" // This variant might not exist by default, adjust as needed
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center p-0.5 text-[0.6rem] leading-tight rounded-full bg-indigo-600 text-white"
                        >
                            {activeFilterCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[320px] sm:w-[340px] bg-[#1A1D2E] border-[#303558] text-slate-300 shadow-2xl p-0"
                sideOffset={10}
                align="end"
            >
                <div className="p-4 pt-5 pb-3 border-b border-[#303558]">
                    <h4 className="font-semibold text-xl text-white">Filter Offers</h4>
                </div>
                <ScrollArea className="max-h-[calc(100vh-250px)] sm:max-h-[60vh]"> {/* Adjust max height */}
                    <div className="p-5 space-y-6">
                        {/* Min. Download Speed */}
                        <div>
                            <Label className="text-[0.9rem] font-medium text-slate-200 block mb-3">
                                Min. Download Speed
                            </Label>
                            <div className="flex items-baseline justify-end mb-2 space-x-1">
                                <div className="bg-transparent border-none focus:ring-0 focus:outline-none p-0 h-auto text-lg font-semibold text-white w-16 text-right tabular-nums">
                                    {draftFilters.minSpeed === 0 ? 'Any' : draftFilters.minSpeed}
                                </div>
                                <span className="text-sm text-slate-400">Mbps</span>
                            </div>
                            <Slider
                                value={[draftFilters.minSpeed]}
                                onValueChange={(v) => handleDraftFilterChange('minSpeed', v[0])}
                                max={maxSpeedAvailable}
                                step={10}
                                className={cn(
                                    "w-full data-[disabled=true]:opacity-50",
                                    "[&>span:nth-child(1)]:h-1.5 [&>span:nth-child(1)]:bg-white/30 dark:[&>span:nth-child(1)]:bg-slate-50/30",
                                    "[&>span:nth-child(1)>span]:bg-white dark:[&>span:nth-child(1)>span]:bg-slate-50"
                                )}
                                disabled={originalOffers.length === 0 && !isLoadingOffers}
                            />
                        </div>

                        {/* Contract Duration */}
                        <div>
                            <Label className="text-[0.9rem] font-medium text-slate-200 block mb-2">
                                Contract Duration
                            </Label>
                            <ToggleGroup
                                type="multiple"
                                value={draftFilters.contractDurations.map(String)}
                                onValueChange={(v) => handleDraftFilterChange('contractDurations', v.map(Number))}
                                className="flex space-x-2.5"
                                disabled={originalOffers.length === 0 && !isLoadingOffers}
                            >
                                {(uniqueContractDurations.length > 0 ? uniqueContractDurations : AVAILABLE_CONTRACT_DURATIONS)
                                    .filter(d => [12, 24].includes(d)) // Example: Show only 12m, 24m
                                    .map(d => (
                                        <ToggleGroupItem
                                            key={d}
                                            value={String(d)}
                                            className={cn(
                                                "text-[0.8rem] h-8 px-3.5 rounded-md border font-medium transition-colors",
                                                "border-[#4A5568] bg-[#2D3748]/60 text-slate-300 hover:bg-[#4A5568]/70",
                                                "data-[state=on]:bg-[#4F46E5] data-[state=on]:text-white data-[state=on]:border-[#4F46E5]",
                                                "data-[disabled=true]:opacity-50 data-[disabled=true]:pointer-events-none"
                                            )}
                                        >
                                            {d}m
                                        </ToggleGroupItem>
                                    ))}
                            </ToggleGroup>
                        </div>

                        {/* Connection Type */}
                        <div>
                            <Label className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">
                                Connection Type
                            </Label>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                {AVAILABLE_CONNECTION_TYPES.map(type => (
                                    <div key={type} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`popover-conn-${type}`}
                                            checked={draftFilters.connectionTypes.includes(type)}
                                            onCheckedChange={(checked) => {
                                                const newTypes = checked
                                                    ? [...draftFilters.connectionTypes, type]
                                                    : draftFilters.connectionTypes.filter(t => t !== type);
                                                handleDraftFilterChange('connectionTypes', newTypes);
                                            }}
                                            className="size-[17px] rounded-[3px] border-[#4A5568] data-[state=checked]:bg-[#4F46E5] data-[state=checked]:text-white data-[state=checked]:border-[#4F46E5] disabled:opacity-50"
                                            disabled={originalOffers.length === 0 && !isLoadingOffers}
                                        />
                                        <Label htmlFor={`popover-conn-${type}`} className="text-sm font-normal text-slate-200 peer-disabled:opacity-50">
                                            {type}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* TV Included & Youth Offer */}
                        <div className="grid grid-cols-2 gap-x-6">
                            <div>
                                <Label className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">TV Included</Label>
                                <RadioGroup
                                    value={draftFilters.tvIncluded}
                                    onValueChange={(value) => handleDraftFilterChange('tvIncluded', value as 'any' | 'yes' | 'no')}
                                    className="space-y-2"
                                    disabled={originalOffers.length === 0 && !isLoadingOffers}
                                >
                                    {(['any', 'yes', 'no'] as const).map(opt => (
                                        <div key={`tv-${opt}`} className="flex items-center space-x-2">
                                            <RadioGroupItem value={opt} id={`popover-tv-${opt}`} className="size-[17px] border-[#4A5568] data-[state=checked]:border-[#4F46E5] data-[state=checked]:text-[#4F46E5] disabled:opacity-50" />
                                            <Label htmlFor={`popover-tv-${opt}`} className="text-sm font-normal text-slate-200 peer-disabled:opacity-50 capitalize">{opt}</Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            </div>
                            <div>
                                <Label className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">Youth Offer</Label>
                                <RadioGroup
                                    value={draftFilters.youthOffer}
                                    onValueChange={(value) => handleDraftFilterChange('youthOffer', value as 'any' | 'yes')}
                                    className="space-y-2"
                                    disabled={originalOffers.length === 0 && !isLoadingOffers}
                                >
                                    {(['any', 'yes'] as const).map(opt => (
                                        <div key={`youth-${opt}`} className="flex items-center space-x-2">
                                            <RadioGroupItem value={opt} id={`popover-youth-${opt}`} className="size-[17px] border-[#4A5568] data-[state=checked]:border-[#4F46E5] data-[state=checked]:text-[#4F46E5] disabled:opacity-50" />
                                            <Label htmlFor={`popover-youth-${opt}`} className="text-sm font-normal text-slate-200 peer-disabled:opacity-50 capitalize">{opt}</Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            </div>
                        </div>

                        {/* Providers */}
                        {(uniqueProviders.length > 0 || isLoadingOffers || originalOffers.length === 0) && (
                            <div>
                                <Label className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">Providers</Label>
                                <ScrollArea className="max-h-36 pr-2">
                                    <div className="space-y-2">
                                        {isLoadingOffers && originalOffers.length === 0 && Array.from({ length: 3 }).map((_, i) => (
                                            <div key={`skel-prov-${i}`} className="flex items-center space-x-2">
                                                <Skeleton className="h-[17px] w-[17px] rounded-[3px] bg-slate-700" />
                                                <Skeleton className="h-4 w-28 bg-slate-700" />
                                            </div>
                                        ))}
                                        {!isLoadingOffers && uniqueProviders.map(provider => (
                                            <div key={provider} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`popover-prov-${provider}`}
                                                    checked={draftFilters.selectedProviders.includes(provider)}
                                                    onCheckedChange={(checked) => {
                                                        const newProviders = checked
                                                            ? [...draftFilters.selectedProviders, provider]
                                                            : draftFilters.selectedProviders.filter(p => p !== provider);
                                                        handleDraftFilterChange('selectedProviders', newProviders);
                                                    }}
                                                    className="size-[17px] rounded-[3px] border-[#4A5568] data-[state=checked]:bg-[#4F46E5] data-[state=checked]:text-white data-[state=checked]:border-[#4F46E5]"
                                                    disabled={originalOffers.length === 0 && !isLoadingOffers}
                                                />
                                                <Label htmlFor={`popover-prov-${provider}`} className="text-sm font-normal text-slate-200">{provider}</Label>
                                            </div>
                                        ))}
                                        {!isLoadingOffers && originalOffers.length > 0 && uniqueProviders.length === 0 && (
                                            <p className="text-xs text-slate-500">No provider data available.</p>
                                        )}
                                        {!isLoadingOffers && originalOffers.length === 0 && (
                                            <p className="text-xs text-slate-500">Search for offers to see providers.</p>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <div className="p-4 flex justify-between items-center border-t border-[#303558]">
                    <Button
                        variant="ghost"
                        onClick={handleReset}
                        className="text-[0.875rem] text-slate-400 hover:text-slate-100 px-3 h-9 rounded-md"
                        // Simple check if draft is different from default. For deep equality, use a library.
                        disabled={JSON.stringify(draftFilters) === JSON.stringify(DEFAULT_FILTERS)}
                    >
                        <XIcon className="mr-1.5 size-4" /> Reset
                    </Button>
                    <Button
                        onClick={handleApply}
                        className="bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[0.875rem] font-medium px-5 h-9 rounded-md"
                    >
                        Apply Filters
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};