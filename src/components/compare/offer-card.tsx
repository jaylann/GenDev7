"use client";

import React, { FC, JSX, useMemo } from "react";
import { motion } from "framer-motion";
import {
    CalendarClock,
    Database, DownloadIcon,
    HardHat,
    Share2Icon,
    Tv2,
    Wifi
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
    DetailBadgeComponent,
    type DetailBadgeInfo as CustomDetailBadgeInfo,
} from "@/components/compare/detail-badge";
import { ProviderLogo } from "@/components/compare/provider-logo";

import { formatDataCap, formatEur } from "@/utils/formatters";
import {
    calculateAvgNetMonthlyCost,
    getIntroPriceDurationMonths,
} from "@/utils/calculations";
import { cn } from "@/lib/utils";
import { Offer } from "@/types/offer";
import { getConnectionTypeDisplayName } from "@/types/connection-type";
import { VoucherBadge } from "./offer-card/voucher-badge";
import { BADGE_COLORS, getBadgeDescription } from "@/utils/offer-card";
import { PriceSection } from "@/components/compare/offer-card/price-section";

export interface OfferCardProps {
    offer: Offer;
    onShareOffer?: (offer: Offer, e?: React.MouseEvent) => void;
    activeShareableSlug?: string | null;
    className?: string;
}

/**
 * Top‑level component that orchestrates sub‑components responsible for specific
 * pieces of UI.  All heavy logic is hoisted into memoised selectors to avoid
 * re‑render overhead.
 */
export const OfferCard: FC<OfferCardProps> = ({
    offer,
    onShareOffer,
    activeShareableSlug,
    className,
}) => {
    // Derived calculations (memoised for performance)
    const introPriceDuration = useMemo(
        () => getIntroPriceDurationMonths(offer),
        [offer],
    );
    const calculationPeriodMonths = useMemo(
        () => Math.max(24, offer.contract_duration_months),
        [offer.contract_duration_months],
    );
    const avgNetCost = useMemo(
        () => calculateAvgNetMonthlyCost(offer, calculationPeriodMonths),
        [offer, calculationPeriodMonths],
    );

    const avgPriceLabel =
        avgNetCost != null
            ? `Avg./mo (${calculationPeriodMonths}m)`
            : "Avg./mo";
    const avgPriceDisplay = avgNetCost != null ? formatEur(avgNetCost) : "N/A";

    // Detail badges (TV, installation, data cap, youth)
    const detailBadges = useMemo<CustomDetailBadgeInfo[]>(() => {
        const badges: CustomDetailBadgeInfo[] = [];

        if (offer.tv_included) {
            const tvText = offer.tv_package_name
                ? offer.tv_package_name.length > 12
                    ? `${offer.tv_package_name.substring(0, 10)}...`
                    : offer.tv_package_name
                : "TV Incl.";
            badges.push({
                badgeKey: "tv",
                icon: Tv2,
                text: tvText,
                colorConfig: BADGE_COLORS.tv,
            });
        }

        badges.push({
            badgeKey: "install",
            icon: HardHat,
            text: offer.installation_service_included
                ? "Install. Free"
                : "Install. Costs",
            colorConfig: BADGE_COLORS.install,
        });

        badges.push({
            badgeKey: "dataCap",
            icon: Database,
            text: formatDataCap(offer.data_cap_gb).replace(" Data", ""),
            colorConfig: BADGE_COLORS.dataCap,
        });

        if (offer.max_age != null) {
            badges.push({
                badgeKey: "youth",
                icon: CalendarClock,
                text: `Youth (≤${offer.max_age}y)`,
                colorConfig: BADGE_COLORS.youth,
            });
        }

        return badges;
    }, [
        offer.tv_included,
        offer.tv_package_name,
        offer.installation_service_included,
        offer.data_cap_gb,
        offer.max_age,
    ]);

    // Render helpers
    const renderHeader = (): JSX.Element => (
        <div className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3 border-b border-[#303558]/80">
            <ProviderLogo
                providerName={offer.provider}
                className="!size-8 sm:!size-10 shrink-0"
            />
            <div className="flex-grow min-w-0 flex flex-col justify-center">
                <h3
                    className="text-sm sm:text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors leading-tight truncate"
                    title={offer.plan_name}
                >
                    {offer.plan_name}
                </h3>
                <p
                    className="text-[0.65rem] sm:text-[0.7rem] text-slate-400 truncate leading-tight"
                    title={`Provider: ${offer.provider}, Product ID: ${offer.product_id}`}
                >
                    by {offer.provider}
                </p>
            </div>

            <div className="ml-auto text-right flex-shrink-0 relative">
                <div
                    className={cn(
                        "transition-opacity duration-200",
                        activeShareableSlug &&
                            onShareOffer &&
                            "group-hover:opacity-30",
                    )}
                >
                    <p className="text-[0.6rem] sm:text-[0.65rem] text-slate-400 whitespace-nowrap">
                        {avgPriceLabel}
                    </p>
                    <p className="text-sm sm:text-base font-semibold text-indigo-300">
                        {avgPriceDisplay}
                    </p>
                </div>
                {activeShareableSlug && onShareOffer && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onShareOffer(offer, e);
                        }}
                        aria-label={`Share ${offer.plan_name}`}
                        title={`Share ${offer.plan_name} details`}
                        className={cn(
                            "absolute inset-0 z-10 flex items-center justify-center rounded-md",
                            "opacity-0 group-hover:opacity-100",
                            "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C203C]",
                            "transition-all duration-200 ease-in-out hover:bg-indigo-500/20",
                        )}
                    >
                        <Share2Icon
                            size={18}
                            className="text-indigo-300 group-hover:scale-110 transition-transform"
                        />
                    </button>
                )}
            </div>
        </div>
    );

    const renderFooterBadges = (): JSX.Element | null => {
        if (!detailBadges.length && !offer.voucher_type) return null;
        return (
            <div className="mt-3 pt-3 sm:mt-4 sm:pt-4 border-t border-[#303558]/80 space-y-2.5">
                {/* Voucher */}
                <VoucherBadge
                    voucher_type={offer.voucher_type ?? null}
                    voucher_value_cents={offer.voucher_value_cents ?? null}
                    voucher_value_percent={offer.voucher_value_percent ?? null}
                    voucher_min_order_value_cents={
                        offer.voucher_min_order_value_cents ?? null
                    }
                    voucher_max_value_cents={
                        offer.voucher_max_value_cents ?? null
                    }
                    voucher_max_runtime_months={
                        offer.voucher_max_runtime_months ?? null
                    }
                />

                {/* Detail badges */}
                {!!detailBadges.length && (
                    <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center pt-1">
                        {detailBadges.map((badgeProps) => (
                            <DetailBadgeComponent
                                key={badgeProps.badgeKey}
                                badgeKey={badgeProps.badgeKey}
                                icon={badgeProps.icon}
                                text={badgeProps.text}
                                colorConfig={badgeProps.colorConfig}
                                description={getBadgeDescription(
                                    badgeProps.badgeKey,
                                )}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // Render – if no offer data we fall back to placeholder error card.
    if (!offer) {
        return (
            <Card
                className={cn(
                    "h-full p-3 sm:p-4 flex items-center justify-center bg-[#1C203C] border border-[#303558]/80 text-slate-300",
                    className,
                )}
            >
                <p>Offer data is unavailable.</p>
            </Card>
        );
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "circOut" }}
            className={cn("h-full", className)}
            data-testid={`offer-card-${offer.product_id}`}
        >
            <Card className="h-full py-1 sm:py-2 bg-[#1C203C] border border-[#303558]/80 text-slate-300 flex flex-col rounded-lg shadow-xl hover:border-indigo-600/70 transition-colors duration-200 group">
                {/* Header */}
                {renderHeader()}

                {/* Body */}
                <div className="p-3 pt-2 sm:p-4 sm:pt-3 flex-grow flex flex-col justify-between">
                    <div>
                        {/* Download speed display */}
                        <div className="text-center mb-2 sm:mb-4">
                            <div className="flex items-center justify-center text-[0.65rem] sm:text-[0.7rem] text-indigo-300 mb-0.5 font-medium">
                                <DownloadIcon
                                    size={14}
                                    className="mr-1 text-indigo-400"
                                />{" "}
                                Download Speed
                            </div>
                            <p className="text-3xl sm:text-4xl font-bold text-white leading-none">
                                {offer.speed_down_mbit ?? "N/A"}
                            </p>
                            <p className="text-xs sm:text-xs text-slate-400 mb-1">
                                Mbps
                            </p>
                        </div>

                        {/* Price section */}
                        <div className="space-y-1 sm:space-y-2 mb-4">
                            <PriceSection
                                priceIntroCents={
                                    offer.price_cents_month_intro ?? null
                                }
                                priceRegularCents={
                                    offer.price_cents_month_regular ?? null
                                }
                                introDurationMonths={introPriceDuration}
                            />
                        </div>

                        {/* Contract + connection type */}
                        <div className="space-y-1.5 text-xs">
                            <div className="flex items-center gap-1">
                                <CalendarClock
                                    size={13}
                                    className="text-slate-500 shrink-0"
                                />
                                <span className="text-slate-400">
                                    Contract:
                                </span>
                                <span className="font-medium text-slate-200">
                                    {offer.contract_duration_months
                                        ? `${offer.contract_duration_months} months`
                                        : "N/A"}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Wifi
                                    size={13}
                                    className="text-slate-500 shrink-0"
                                />
                                <span className="text-slate-400">Type:</span>
                                <span className="font-medium text-slate-200">
                                    {offer.connection_type
                                        ? getConnectionTypeDisplayName(
                                              offer.connection_type,
                                          )
                                        : "N/A"}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Footer badges */}
                    {renderFooterBadges()}
                </div>
            </Card>
        </motion.div>
    );
};
