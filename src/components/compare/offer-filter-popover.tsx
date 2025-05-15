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
import { SlidersHorizontal, X as XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FiltersState } from '@/types/filters-state';
import { Offer } from '@/types/offer';
import {
    AVAILABLE_CONNECTION_TYPES,
    AVAILABLE_CONTRACT_DURATIONS,
    AVAILABLE_PROVIDER_NAMES, // Retained import
    DEFAULT_FILTERS,
    MAX_SPEED_FALLBACK,
    MIN_SPEED_SLIDER_FLOOR,
} from '@/config/constants';

interface OfferFilterPopoverProps {
    appliedFilters: FiltersState;
    onApplyFilters: (newFilters: FiltersState) => void;
    originalOffers: Offer[];
    isLoadingOffers: boolean;
    activeFilterCount: number;
}

/**
 * Popover component allowing users to adjust filters. All controls stay
 * interactive before any search so users can pre-select their preferences.
 * The provider list always uses `AVAILABLE_PROVIDER_NAMES` to ensure all
 * predefined providers are consistently available for selection, regardless
 * of current search results.
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

    // ---------------------------------------------------------------------
    // Synchronise external filter resets
    // ---------------------------------------------------------------------
    useEffect(() => {
        setDraftFilters(appliedFilters);
    }, [appliedFilters]);

    const controlsDisabled = isLoadingOffers; // Only lock while loading

    const handleDraftFilterChange = <K extends keyof FiltersState>(
        key: K,
        value: FiltersState[K],
    ) => setDraftFilters((prev) => ({ ...prev, [key]: value }));

    const handleApply = () => {
        onApplyFilters(draftFilters);
        setIsOpen(false);
    };

    const handleReset = () => {
        setDraftFilters(DEFAULT_FILTERS);
    };

    // ---------------------------------------------------------------------
    // Derived data helpers
    // ---------------------------------------------------------------------
    /**
     * The list of provider names to display in the filter.
     * Always uses the predefined `AVAILABLE_PROVIDER_NAMES` and sorts them for consistent display.
     * @type {ReadonlyArray<string>}
     */
    const providerList = useMemo(
        () => [...AVAILABLE_PROVIDER_NAMES].sort(),
        [] // Ensures this memoizes correctly and only runs once
    );

    const uniqueContractDurations = useMemo(
        () =>
            Array.from(new Set(originalOffers.map((o) => o.contract_duration_months)))
                .filter(Boolean)
                .sort((a, b) => a - b),
        [originalOffers],
    );

    const maxSpeedAvailable = useMemo(() => {
        if (originalOffers.length === 0) return MAX_SPEED_FALLBACK;
        return Math.max(
            ...originalOffers.map((o) => o.speed_down_mbit),
            MIN_SPEED_SLIDER_FLOOR,
        );
    }, [originalOffers]);

    // ---------------------------------------------------------------------
    // UI
    // ---------------------------------------------------------------------
    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    className="text-slate-300 hover:text-white hover:bg-slate-700/50 px-3 py-1.5 relative"
                >
                    <SlidersHorizontal className="mr-2 size-4" /> Filters
                    {activeFilterCount > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center p-0.5 text-[0.6rem] rounded-full bg-indigo-600 text-white"
                        >
                            {activeFilterCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[320px] sm:w-[340px] bg-[#1A1D2E] border-[#303558] text-slate-300 shadow-2xl p-0 max-h-[80vh] overflow-hidden"
                sideOffset={10}
                align="end"
            >
                <div className="p-4 pt-3 pb-3 border-b border-[#303558]">
                    <h4 className="font-semibold text-xl text-white">Filter Offers</h4>
                </div>
                <ScrollArea className="max-h-[calc(100vh-250px)] sm:max-h-[60vh]">
                    <div className="p-5 space-y-4">
                        {/* Min speed */}
                        <div>
                            <div className="flex items-baseline justify-between mb-3">
                                <Label className="text-[0.9rem] font-medium text-slate-200">
                                    Min. Download Speed
                                </Label>
                                <div className="flex items-baseline space-x-1">
                                    <div className="w-16 text-right tabular-nums text-lg font-semibold text-white">
                                        {draftFilters.minSpeed === 0 ? 'Any' : draftFilters.minSpeed}
                                    </div>
                                    <span className="text-sm text-slate-400">Mbps</span>
                                </div>
                            </div>
                            <Slider
                                value={[draftFilters.minSpeed]}
                                onValueChange={(v) => handleDraftFilterChange('minSpeed', v[0])}
                                max={maxSpeedAvailable}
                                step={10}
                                disabled={controlsDisabled}
                                className={cn(
                                    'w-full',
                                    '[&>span:nth-child(1)]:h-1.5 [&>span:nth-child(1)]:bg-white/30',
                                    '[&>span:nth-child(1)>span]:bg-white',
                                )}
                            />
                        </div>

                        {/* Contract duration */}
                        <div>
                            <Label className="text-[0.9rem] font-medium text-slate-200 block mb-2">
                                Contract Duration
                            </Label>
                            <ToggleGroup
                                type="multiple"
                                value={draftFilters.contractDurations.map(String)}
                                onValueChange={(v) => handleDraftFilterChange('contractDurations', v.map(Number))}
                                disabled={controlsDisabled}
                                className="flex space-x-2.5"
                            >
                                {(uniqueContractDurations.length ? uniqueContractDurations : AVAILABLE_CONTRACT_DURATIONS)
                                    .filter((d) => [12, 24].includes(d))
                                    .map((d) => (
                                        <ToggleGroupItem
                                            key={d}
                                            value={String(d)}
                                            className={cn(
                                                'h-8 px-3.5 text-[0.8rem] rounded-md border',
                                                'border-[#4A5568] bg-[#2D3748]/60 text-slate-300 hover:bg-[#4A5568]/70',
                                                'data-[state=on]:bg-[#4F46E5] data-[state=on]:border-[#4F46E5] data-[state=on]:text-white',
                                            )}
                                        >
                                            {d}m
                                        </ToggleGroupItem>
                                    ))}
                            </ToggleGroup>
                        </div>

                        {/* Connection type */}
                        <div>
                            <Label className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">
                                Connection Type
                            </Label>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                {AVAILABLE_CONNECTION_TYPES.map((type) => (
                                    <div key={type} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`conn-${type}`}
                                            checked={draftFilters.connectionTypes.includes(type)}
                                            onCheckedChange={(checked) => {
                                                const newTypes = checked
                                                    ? [...draftFilters.connectionTypes, type]
                                                    : draftFilters.connectionTypes.filter((t) => t !== type);
                                                handleDraftFilterChange('connectionTypes', newTypes);
                                            }}
                                            disabled={controlsDisabled}
                                            className="size-[17px] rounded-[3px] border-[#4A5568] data-[state=checked]:bg-[#4F46E5] data-[state=checked]:text-white data-[state=checked]:border-[#4F46E5]"
                                        />
                                        <Label htmlFor={`conn-${type}`} className="text-sm font-normal text-slate-200">
                                            {type}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Providers */}
                        <div>
                            <Label className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">
                                Providers
                            </Label>
                            <ScrollArea className="max-h-36 pr-2">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                    {providerList.map((provider) => (
                                        <div key={provider} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`prov-${provider}`}
                                                checked={draftFilters.selectedProviders.includes(provider)}
                                                onCheckedChange={(checked) => {
                                                    const newList = checked
                                                        ? [...draftFilters.selectedProviders, provider]
                                                        : draftFilters.selectedProviders.filter((p) => p !== provider);
                                                    handleDraftFilterChange('selectedProviders', newList);
                                                }}
                                                disabled={controlsDisabled}
                                                className="size-[17px] rounded-[3px] border-[#4A5568] data-[state=checked]:bg-[#4F46E5] data-[state=checked]:text-white data-[state=checked]:border-[#4F46E5]"
                                            />
                                            <Label htmlFor={`prov-${provider}`} className="text-sm font-normal text-slate-200">
                                                {provider}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>

                        {/* TV Included & Youth Offer */}
                        <div className="grid grid-cols-2 gap-x-6">
                            <div>
                                <Label className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">
                                    TV Included
                                </Label>
                                <RadioGroup
                                    value={draftFilters.tvIncluded}
                                    onValueChange={(value) => handleDraftFilterChange('tvIncluded', value as 'any' | 'yes' | 'no')}
                                    disabled={controlsDisabled}
                                >
                                    {(['any', 'yes', 'no'] as const).map((opt) => (
                                        <div key={opt} className="flex items-center space-x-2">
                                            <RadioGroupItem value={opt} id={`tv-${opt}`} className="size-[17px] border-[#4A5568] data-[state=checked]:border-[#4F46E5] data-[state=checked]:text-[#4F46E5]" />
                                            <Label htmlFor={`tv-${opt}"`} className="text-sm font-normal text-slate-200 capitalize">{opt}</Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            </div>
                            <div>
                                <Label className="text-[0.9rem] font-medium text-slate-200 block mb-2.5">
                                    Youth Offer
                                </Label>
                                <RadioGroup
                                    value={draftFilters.youthOffer}
                                    onValueChange={(value) => handleDraftFilterChange('youthOffer', value as 'any' | 'yes')}
                                    disabled={controlsDisabled}
                                >
                                    {(['any', 'yes'] as const).map((opt) => (
                                        <div key={opt} className="flex items-center space-x-2">
                                            <RadioGroupItem value={opt} id={`youth-${opt}`} className="size-[17px] border-[#4A5568] data-[state=checked]:border-[#4F46E5] data-[state=checked]:text-[#4F46E5]" />
                                            <Label htmlFor={`youth-${opt}`} className="text-sm font-normal text-slate-200 capitalize">{opt}</Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
                <div className="p-4 py-3 flex justify-between items-center border-t border-[#303558]">
                    <Button
                        variant="ghost"
                        onClick={handleReset}
                        className="text-[0.875rem] text-slate-400 hover:text-slate-100 px-5 h-9 rounded-md hover:bg-[#303558]"
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