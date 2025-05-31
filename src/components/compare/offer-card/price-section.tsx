"use client";

import React, { FC } from "react";
import { formatEur } from "@/utils/formatters";

export interface PriceSectionProps {
    /** Introductory monthly price in cents (null if none) */
    priceIntroCents: number | null;
    /** Regular monthly price in cents */
    priceRegularCents: number | null;
    /** Duration (in months) that the intro price applies for */
    introDurationMonths: number;
}

/**
 * Displays both the introductory and regular price sections.
 * Extracted from the original monolithic component so it can be unit‑tested in
 * isolation and reused elsewhere if needed.
 */
export const PriceSection: FC<PriceSectionProps> = ({
    priceIntroCents,
    priceRegularCents,
    introDurationMonths,
}) => {
    // If intro equals regular just present a single price block.
    if (
        priceIntroCents != null &&
        priceRegularCents != null &&
        priceIntroCents === priceRegularCents
    ) {
        return (
            <div>
                <span className="text-[0.7rem] text-slate-400 block mb-0">
                    Price:
                </span>
                <p className="text-lg sm:text-xl font-semibold text-white leading-tight">
                    {formatEur(priceIntroCents)}
                    <span className="text-sm sm:text-base font-normal text-slate-400">
                        /mo
                    </span>
                </p>
            </div>
        );
    }

    return (
        <>
            {/* Introductory price (if any) */}
            {priceIntroCents != null && priceIntroCents > 0 && (
                <div>
                    <span className="text-[0.7rem] text-slate-400 block mb-0">
                        Intro Price:
                    </span>
                    <p className="text-lg sm:text-xl font-semibold text-white leading-tight">
                        {formatEur(priceIntroCents)}
                        <span className="text-sm sm:text-base font-normal text-slate-400">
                            /mo
                        </span>
                    </p>
                    <p className="text-[0.65rem] sm:text-xs text-slate-500 leading-tight">
                        first{" "}
                        {introDurationMonths > 0 ? introDurationMonths : "?"}{" "}
                        months
                    </p>
                </div>
            )}

            {/* Regular price */}
            {priceRegularCents != null && priceRegularCents > 0 && (
                <div>
                    <span className="text-[0.7rem] text-slate-400 block mb-0">
                        {priceIntroCents != null ? "Then:" : "Price:"}
                    </span>
                    <p className="text-base sm:text-lg font-medium text-slate-300 leading-tight">
                        {formatEur(priceRegularCents)}
                        <span className="text-sm sm:text-base font-normal text-slate-400">
                            /mo
                        </span>
                    </p>
                </div>
            )}
        </>
    );
};
