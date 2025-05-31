"use client";

import React, { FC, JSX, useCallback, useMemo } from "react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import {
    Gift,
    Sparkles,
    Percent,
    Tag,
    AlertTriangle,
    Info,
    CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEur } from "@/utils/formatters";
import { getVoucherKindDisplayName, VoucherKind } from "@/types/voucher-kind";

export interface VoucherBadgeProps {
    voucher_type: VoucherKind | null;
    voucher_value_cents: number | null;
    voucher_value_percent: number | null;
    voucher_min_order_value_cents: number | null;
    voucher_max_value_cents: number | null;
    voucher_max_runtime_months: number | null;
}

/**
 * Stand-alone component that encapsulates the full voucher popover logic.
 * All calculation details are private to this file so the parent card remains
 * focused on layout composition.
 */
export const VoucherBadge: FC<VoucherBadgeProps> = (props) => {
    const {
        voucher_type,
        voucher_value_cents,
        voucher_value_percent,
        voucher_min_order_value_cents,
        voucher_max_value_cents,
        voucher_max_runtime_months,
    } = props;

    /** Prominent display for ABSOLUTE / CASHBACK */
    const prominentBonusText = useMemo<string | null>(() => {
        if (
            voucher_type &&
            (voucher_type === VoucherKind.ABSOLUTE ||
                voucher_type === VoucherKind.CASHBACK) &&
            voucher_value_cents != null &&
            voucher_value_cents > 0
        ) {
            const effectiveValue = Math.min(
                voucher_value_cents,
                voucher_max_value_cents ?? voucher_value_cents,
            );
            return `${formatEur(effectiveValue)} ${getVoucherKindDisplayName(voucher_type)}`;
        }
        return null;
    }, [voucher_type, voucher_value_cents, voucher_max_value_cents]);

    /** Human-readable summary for the badge itself */
    const { summaryText, IconComponent } = useMemo(() => {
        let text = voucher_type ? getVoucherKindDisplayName(voucher_type) : "";
        let Icon: React.ElementType = Gift;

        if (prominentBonusText) {
            text = prominentBonusText;
            Icon = Sparkles;
        } else if (
            voucher_type === VoucherKind.PERCENTAGE &&
            voucher_value_percent != null
        ) {
            text = `${voucher_value_percent}% Off`;
            Icon = Percent;
        } else if (voucher_type === VoucherKind.DISCOUNT) {
            if (voucher_value_cents != null)
                text = `${formatEur(voucher_value_cents)} Discount`;
            else if (voucher_value_percent != null)
                text = `${voucher_value_percent}% Discount`;
            else text = "Special Discount";
            Icon = Tag;
        }

        return { summaryText: text, IconComponent: Icon } as const;
    }, [
        voucher_type,
        prominentBonusText,
        voucher_value_percent,
        voucher_value_cents,
    ]);

    /**
     * Renders the detailed popover content; extracted so the main render tree is
     * easier to read.
     */
    const renderVoucherPopoverContent = useCallback((): JSX.Element => {
        if (!voucher_type) {
            return (
                <p className="p-4 text-sm text-slate-400">
                    No active voucher for this offer.
                </p>
            );
        }

        const details: JSX.Element[] = [];

        if (
            voucher_value_cents != null &&
            (voucher_type === VoucherKind.ABSOLUTE ||
                voucher_type === VoucherKind.CASHBACK ||
                (voucher_type === VoucherKind.DISCOUNT &&
                    voucher_value_percent == null))
        ) {
            details.push(
                <div className="flex items-center" key="val-cents">
                    <Tag size={16} className="mr-2 text-sky-400 shrink-0" />
                    Value:&nbsp;
                    <strong>{formatEur(voucher_value_cents)}</strong>
                </div>,
            );
        }

        if (
            voucher_value_percent != null &&
            (voucher_type === VoucherKind.PERCENTAGE ||
                voucher_type === VoucherKind.DISCOUNT)
        ) {
            details.push(
                <div className="flex items-center" key="val-percent">
                    <Percent size={16} className="mr-2 text-sky-400 shrink-0" />
                    Discount:&nbsp;<strong>{voucher_value_percent}%</strong>
                </div>,
            );
        }

        if (voucher_max_value_cents != null) {
            details.push(
                <div className="flex items-center" key="max-val">
                    <AlertTriangle
                        size={16}
                        className="mr-2 text-orange-400 shrink-0"
                    />
                    Max. Benefit:&nbsp;
                    <strong>{formatEur(voucher_max_value_cents)}</strong>
                </div>,
            );
        }

        if (voucher_min_order_value_cents != null) {
            details.push(
                <div className="flex items-center" key="min-order">
                    <Info size={16} className="mr-2 text-slate-400 shrink-0" />
                    Min. Order Value:&nbsp;
                    <strong>{formatEur(voucher_min_order_value_cents)}</strong>
                </div>,
            );
        }

        if (voucher_max_runtime_months != null) {
            details.push(
                <div className="flex items-center" key="max-runtime">
                    <CalendarClock
                        size={16}
                        className="mr-2 text-purple-400 shrink-0"
                    />
                    Max. Duration:&nbsp;
                    <strong>{voucher_max_runtime_months} months</strong>
                </div>,
            );
        }

        if (details.length === 0) {
            details.push(
                <p key="no-details" className="text-slate-400">
                    General {getVoucherKindDisplayName(voucher_type)} applies.
                </p>,
            );
        }

        return (
            <div className="p-4 space-y-2.5 text-sm bg-[#232740] border border-[#303558] text-slate-200 rounded-md shadow-xl">
                <h4 className="font-semibold text-base mb-2 text-white">
                    {getVoucherKindDisplayName(voucher_type)} Details
                </h4>
                {details}
                {(voucher_type === VoucherKind.PERCENTAGE ||
                    (voucher_type === VoucherKind.DISCOUNT &&
                        voucher_value_percent != null)) && (
                    <p className="text-xs text-slate-400 mt-3 pt-2 border-t border-[#303558]/50">
                        Percentage discount applies monthly to the current
                        tariff price, up to the maximum benefit and duration
                        shown.
                    </p>
                )}
            </div>
        );
    }, [
        voucher_type,
        voucher_value_cents,
        voucher_value_percent,
        voucher_min_order_value_cents,
        voucher_max_value_cents,
        voucher_max_runtime_months,
    ]);

    // If no voucher just bail out early to keep parent render minimal.
    if (!voucher_type) return null;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <ShadcnBadge
                    variant="default"
                    className={cn(
                        "w-full cursor-pointer justify-center gap-1 text-xs font-semibold py-1 rounded-md leading-tight transition-all hover:opacity-80 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C203C]",
                        prominentBonusText
                            ? "bg-green-500 hover:bg-green-600 text-white"
                            : "bg-pink-600 hover:bg-pink-700 text-white",
                    )}
                >
                    <IconComponent size={14} /> {summaryText}
                </ShadcnBadge>
            </PopoverTrigger>
            <PopoverContent
                className="w-80 z-50 p-0 border-none bg-transparent"
                side="top"
                align="center"
            >
                {renderVoucherPopoverContent()}
            </PopoverContent>
        </Popover>
    );
};
