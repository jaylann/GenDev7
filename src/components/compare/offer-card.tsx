import React, { FC } from "react";
import {
    CalendarClock,
    Database,
    Download as DownloadIcon, // Aliased for clarity
    Upload as UploadIcon,     // Added UploadIcon
    DownloadCloud,
    Gift,
    ShieldCheck,
    Sparkles,
    Star,
    Tv2,
    Wifi
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { SortOptionKey } from "@/types/sort-option-key";
import { Offer } from "@/types/offer"; // Assuming this path is correct
import { formatEur } from "@/utils/formatters"; // Assuming this path is correct
import { ProviderLogo } from "@/components/compare/provider-logo"; // Assuming this path is correct
import { DetailBadgeComponent, DetailBadgeInfo } from "@/components/compare/detail-badge"; // Assuming this path is correct

// Define badge color configurations outside the component for performance and clarity
const BADGE_COLORS = {
    tv: { bg: "bg-purple-600/20", text: "text-purple-300", border: "border-purple-500/50", icon: "text-purple-400" },
    install: { bg: "bg-sky-600/20", text: "text-sky-300", border: "border-sky-500/50", icon: "text-sky-400" },
    dataCap: { bg: "bg-amber-600/20", text: "text-amber-300", border: "border-amber-500/50", icon: "text-amber-400" },
    youth: { bg: "bg-teal-600/20", text: "text-teal-300", border: "border-teal-500/50", icon: "text-teal-400" },
    discount: { bg: "bg-pink-600/20", text: "text-pink-300", border: "border-pink-500/50", icon: "text-pink-400" },
    recommend: { bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/50", icon: "text-yellow-400" },
};

interface OfferCardProps {
    offer: Offer;
    currentSortOption: SortOptionKey;
}

/**
 * OfferCard component displays individual internet service offer details in a card format.
 * It showcases key information like provider, plan name, speeds, pricing, and special features.
 * Animations are handled by Framer Motion for a smooth user experience.
 *
 * @param {OfferCardProps} props - The props for the OfferCard component.
 * @param {Offer} props.offer - The offer data object containing all details of the service.
 * @param {SortOptionKey} props.currentSortOption - The currently active sort option, used to highlight relevant information (e.g., recommendation score).
 * @returns {JSX.Element} The rendered OfferCard component.
 */
export const OfferCard: FC<OfferCardProps> = ({ offer, currentSortOption }) => {
    const displayPriceIntro = formatEur(offer.price_cents_month_intro);
    const displayPriceRegular = offer.price_cents_month_regular != null && offer.price_cents_month_regular !== offer.price_cents_month_intro
        ? formatEur(offer.price_cents_month_regular)
        : null;
    const avgPriceDisplay = offer.effective_price_24_months != null
        ? formatEur(offer.effective_price_24_months)
        : 'N/A';

    let prominentBonusText: string | null = null;
    if ((offer.voucher_type === 'absolute' || offer.voucher_type === 'cashback') && offer.voucher_value_cents != null && offer.voucher_value_cents > 0) {
        prominentBonusText = `${formatEur(offer.voucher_value_cents)} ${offer.voucher_type === 'cashback' ? 'Cashback' : 'Bonus'}`;
    }

    const detailBadges: DetailBadgeInfo[] = [];

    if (currentSortOption === 'recommended' && offer.recommendation_score != null) {
        detailBadges.push({
            key: 'reco',
            icon: Star,
            text: `Score: ${offer.recommendation_score.toFixed(2)}`,
            colorConfig: BADGE_COLORS.recommend,
        });
    }

    if (offer.tv_included) {
        let tvText = "TV Incl.";
        if (offer.tv_package_name) {
            tvText = `TV (${offer.tv_package_name.length > 10 ? `${offer.tv_package_name.substring(0, 8)}...` : offer.tv_package_name})`;
        }
        detailBadges.push({ key: 'tv', icon: Tv2, text: tvText, colorConfig: BADGE_COLORS.tv });
    }

    if (offer.installation_service_included != null) { // Checks for boolean explicitly, not just undefined/null
        let installText: string;
        if (offer.installation_service_included) {
            installText = "Install Incl.";
        } else if ((offer.installation_cost_cents ?? 0) > 0) {
            installText = `Install: ${formatEur(offer.installation_cost_cents!)}`; // Non-null assertion as >0 implies value
        } else {
            installText = "Install Opt.";
        }
        detailBadges.push({ key: 'install', icon: DownloadCloud, text: installText, colorConfig: BADGE_COLORS.install });
    }

    if (offer.data_cap_gb != null) {
        detailBadges.push({
            key: 'dataCap',
            icon: Database,
            text: `${offer.data_cap_gb} GB Cap`,
            colorConfig: BADGE_COLORS.dataCap,
        });
    }

    if (offer.max_age != null) {
        detailBadges.push({
            key: 'youth',
            icon: ShieldCheck,
            text: `Youth (≤${offer.max_age}y)`,
            colorConfig: BADGE_COLORS.youth,
        });
    }

    // Only show percentage discount as a badge if no prominent bonus is already set
    if (!prominentBonusText && offer.voucher_type === 'percentage' && offer.voucher_value_percent != null && offer.voucher_value_percent > 0) {
        detailBadges.push({
            key: 'discount',
            icon: Gift,
            text: `${offer.voucher_value_percent}% Off`,
            colorConfig: BADGE_COLORS.discount,
        });
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "circOut" }}
            className="h-full"
        >
            <Card
                className="h-full py-2 bg-[#1C203C] border border-[#303558]/80 text-slate-300 flex flex-col rounded-lg shadow-lg hover:border-indigo-600/70 transition-colors duration-200 group data-[selected=true]:border-indigo-500 data-[selected=true]:ring-2 data-[selected=true]:ring-indigo-500"
            >
                {/* Header: Provider Info and Average Price */}
                <div className="p-4 flex items-center gap-2.5 border-b border-[#303558]/80">
                    <ProviderLogo
                        providerName={offer.provider}
                        className="!size-8 bg-slate-700 group-hover:bg-indigo-700 p-1"
                    />
                    <div>
                        <h3 className="text-[0.9rem] font-semibold text-white group-hover:text-indigo-300 transition-colors leading-tight">
                            {offer.provider}
                        </h3>
                        <p
                            className="text-[0.7rem] text-slate-400 truncate leading-tight max-w-[180px] xs:max-w-[200px]"
                            title={offer.plan_name}
                        >
                            {offer.plan_name}
                        </p>
                    </div>
                    <div className="ml-auto text-right">
                        <p className="text-[0.65rem] text-slate-400">Avg./mo (24m)</p>
                        <p className="text-sm font-semibold text-indigo-300">{avgPriceDisplay}</p>
                    </div>
                </div>

                {/* Body: Speeds, Pricing, Contract Details */}
                <div className="p-4 pt-0 flex-grow flex flex-col justify-between">
                    <div>
                        {/* Speed Section */}
                        <div className="text-center mb-3">
                            {/* Download Speed */}
                            <div className="flex items-center justify-center text-[0.65rem] text-indigo-300 mb-0.5 font-medium">
                                <DownloadIcon size={14} className="mr-1 text-indigo-400" /> Download
                            </div>
                            <p className="text-4xl font-bold text-white leading-none">{offer.speed_down_mbit}</p>
                            <p className="text-xs text-slate-400 mb-1">Mbps</p>

                            {/* Upload Speed (Conditional) */}
                            {offer.speed_up_mbit != null && (
                                <div className="mt-1.5">
                                    <div className="flex items-center justify-center text-[0.6rem] text-indigo-300/80 font-medium">
                                        <UploadIcon size={12} className="mr-0.5 text-indigo-400/80" /> Upload
                                    </div>
                                    <p className="text-2xl font-semibold text-white/90 leading-none">{offer.speed_up_mbit}</p>
                                    <p className="text-[0.6rem] text-slate-400/90">Mbps</p>
                                </div>
                            )}
                        </div>

                        {/* Pricing Section */}
                        <div className="space-y-1.5 mb-3">
                            <div>
                                <span className="text-[0.7rem] text-slate-400 block mb-0">Intro Price:</span>
                                <p className="text-xl font-semibold text-white leading-tight">
                                    {displayPriceIntro} <span className="text-base font-normal text-slate-400">/mo</span>
                                </p>
                                <p className="text-[0.65rem] text-slate-500 leading-tight">
                                    first {offer.contract_duration_months} months
                                </p>
                            </div>
                            {displayPriceRegular && (
                                <div>
                                    <span className="text-[0.7rem] text-slate-400 block mb-0">Regular:</span>
                                    <p className="text-lg font-medium text-slate-300 leading-tight">
                                        {displayPriceRegular} <span className="text-sm font-normal text-slate-400">/mo</span>
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Contract Details Section */}
                        <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-1.5">
                                <CalendarClock size={13} className="text-slate-500 shrink-0" />
                                <span className="text-slate-400">Contract:</span>
                                <span className="font-medium text-slate-200">{offer.contract_duration_months} months</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Wifi size={13} className="text-slate-500 shrink-0" />
                                <span className="text-slate-400">Type:</span>
                                <span className="font-medium text-slate-200">{offer.connection_type}</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer: Bonuses and Badges */}
                    {(prominentBonusText || detailBadges.length > 0) && (
                        <div className="mt-3 pt-3 border-t border-[#303558]/80 space-y-2">
                            {prominentBonusText && (
                                <Badge
                                    variant="default" // Ensure this variant provides the desired styling or adjust as needed
                                    className="w-full justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1.5 rounded-md leading-tight"
                                >
                                    <Sparkles size={14} /> {prominentBonusText}
                                </Badge>
                            )}
                            {detailBadges.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 justify-center">
                                    {/* React uses the `key` prop from `badgeInfo.key` for reconciliation.
                                        Spreading `badgeInfo` passes all its properties to `DetailBadgeComponent`. */}
                                    {detailBadges.map(badgeInfo => (
                                        <DetailBadgeComponent {...badgeInfo} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Card>
        </motion.div>
    );
};

// Note: The `Offer` interface provided in the prompt is assumed to be in "@/types/offer".
// Ensure `ConnectionType` and `VoucherKind` enums/types are also correctly defined and imported where `Offer` is defined.
// For example, if they were in the same file:
// export enum ConnectionType { DSL = "DSL", CABLE = "Cable", FIBER = "Fiber", /* ... */ }
// export enum VoucherKind { ABSOLUTE = "absolute", PERCENTAGE = "percentage", CASHBACK = "cashback", /* ... */ }

/**
 * Represents an internet service offer with all its details.
 * This is a copy of the interface provided in the prompt for context.
 * It should ideally be imported from its actual location (e.g., "@/types/offer").
 */
// export interface Offer {
//     provider: string;
//     plan_name: string;
//     product_id: string; // Typically not displayed in UI summary cards
//     speed_down_mbit: number;
//     speed_up_mbit?: number | null;
//     price_cents_month_intro: number;
//     price_cents_month_regular?: number | null;
//     contract_duration_months: number;
//     connection_type: ConnectionType; // Assumed to be an enum or string literal type
//     voucher_type?: VoucherKind | null; // Assumed to be an enum or string literal type
//     voucher_value_cents?: number | null;
//     voucher_value_percent?: number | null;
//     installation_service_included?: boolean; // Can be true (included), false (not included explicitly), or undefined (info not available)
//     installation_cost_cents?: number | null;
//     tv_included?: boolean;
//     tv_package_name?: string | null;
//     data_cap_gb?: number | null;
//     max_age?: number | null; // For youth tariffs
//     // Calculated fields, likely added server-side or in a data transformation step
//     effective_price_24_months?: number;
//     recommendation_score?: number;
// }