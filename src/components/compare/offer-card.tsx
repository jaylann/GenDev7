import React, {FC, JSX} from "react";
import {
    CalendarClock,
    Database,
    Download as DownloadIcon,
    DownloadCloud,
    Gift,
    ShieldCheck,
    Sparkles,
    Tv2,
    Wifi
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {motion} from "framer-motion";
import {Card} from "@/components/ui/card";
import {Offer} from "@/types/offer"; // Ensure this path is correct
// Make sure VoucherKind is imported if you're using it with VoucherKind.ABSOLUTE etc.
// import { VoucherKind } from "@/types/voucher-kind"; // Or from "@/types/offer" if re-exported
import {formatEur} from "@/utils/formatters";
import {ProviderLogo} from "@/components/compare/provider-logo";
import {DetailBadgeComponent, DetailBadgeInfo} from "@/components/compare/detail-badge";

// Badge color configurations
const BADGE_COLORS = {
    tv: {bg: "bg-purple-600/20", text: "text-purple-300", border: "border-purple-500/50", icon: "text-purple-400"},
    install: {bg: "bg-sky-600/20", text: "text-sky-300", border: "border-sky-500/50", icon: "text-sky-400"},
    dataCap: {bg: "bg-amber-600/20", text: "text-amber-300", border: "border-amber-500/50", icon: "text-amber-400"},
    youth: {bg: "bg-teal-600/20", text: "text-teal-300", border: "border-teal-500/50", icon: "text-teal-400"},
    discount: {bg: "bg-pink-600/20", text: "text-pink-300", border: "border-pink-500/50", icon: "text-pink-400"},
};

interface OfferCardProps {
    offer: Offer;
}

// --- Helper Functions for Price Calculation ---

/**
 * Calculates the effective monetary value of a voucher for an offer.
 * Percentage vouchers apply to `price_cents_month_intro` for each month
 * of `contract_duration_months`, capped by `voucher_max_value_cents`.
 * @param {Offer} offer - The offer object.
 * @returns {number} The calculated total voucher value in cents.
 */
const calculateEffectiveVoucherValue = (offer: Offer): number => {
    let totalVoucherValueApplied = 0;

    if (!offer.voucher_type) {
        return 0;
    }
    // Using string literals as per your current code. If VoucherKind enum is available, prefer that.
    switch (offer.voucher_type) {
        case "absolute":
        case "cashback":
            totalVoucherValueApplied = offer.voucher_value_cents ?? 0;
            // Apply cap if business rule dictates it for absolute/cashback too
            // if (offer.voucher_max_value_cents != null) {
            //     totalVoucherValueApplied = Math.min(totalVoucherValueApplied, offer.voucher_max_value_cents);
            // }
            break;

        case "percentage":
        case "discount":
            if (offer.voucher_value_percent != null && offer.voucher_value_percent > 0) {
                const monthlyIntroPrice = offer.price_cents_month_intro;
                const introDurationForVoucher = offer.contract_duration_months; // Voucher applies over intro period
                const percentOff = offer.voucher_value_percent / 100;
                const maxCap = offer.voucher_max_value_cents ?? Infinity;

                if (monthlyIntroPrice != null && monthlyIntroPrice > 0 && introDurationForVoucher != null && introDurationForVoucher > 0) {
                    for (let month = 0; month < introDurationForVoucher; month++) {
                        if (totalVoucherValueApplied >= maxCap) break;
                        const discountThisMonth = monthlyIntroPrice * percentOff;
                        const applicableDiscountThisMonth = Math.min(discountThisMonth, maxCap - totalVoucherValueApplied);
                        totalVoucherValueApplied += applicableDiscountThisMonth;
                    }
                }
            } else if (offer.voucher_type === "discount" && offer.voucher_value_cents != null) {
                totalVoucherValueApplied = offer.voucher_value_cents;
                if (offer.voucher_max_value_cents != null) {
                    totalVoucherValueApplied = Math.min(totalVoucherValueApplied, offer.voucher_max_value_cents);
                }
            }
            break;
        default:
            // console.warn(`Unknown voucher type: ${offer.voucher_type}`);
            break;
    }
    return Math.max(0, Math.round(totalVoucherValueApplied));
};

/**
 * Calculates the gross total cost of an offer over a dynamic period.
 * @param {number | null | undefined} introPrice - Price per month during the introductory period (in cents).
 * @param {number | null | undefined} regularPrice - Regular price per month after intro period (in cents).
 * @param {number | null | undefined} introDurationMonths - Duration of the introductory price period (in months).
 * @param {number} calculationPeriodMonths - The total period (in months) over which to calculate the cost.
 * @returns {number | null} The total gross cost over the calculation period in cents, or null if not enough information.
 */
const calculateGrossTotalCostOverDynamicPeriod = (
    introPrice: number | null | undefined,
    regularPrice: number | null | undefined,
    introDurationMonths: number | null | undefined,
    calculationPeriodMonths: number
): number | null => {
    // Scenario 1: Valid intro price and duration for the intro period itself
    if (introPrice != null && introPrice > 0 && introDurationMonths != null && introDurationMonths > 0) {
        const effectiveRegularPrice = regularPrice ?? introPrice; // Fallback to intro if regular is not set

        // If the intro period covers or exceeds the entire calculation period
        if (introDurationMonths >= calculationPeriodMonths) {
            return introPrice * calculationPeriodMonths;
        } else {
            // Cost during intro period + cost during regular period for the remainder
            return (introPrice * introDurationMonths) + (effectiveRegularPrice * (calculationPeriodMonths - introDurationMonths));
        }
    }
    // Scenario 2: No valid intro period, but regular price exists
    else if (regularPrice != null && regularPrice > 0) {
        return regularPrice * calculationPeriodMonths; // Assume flat regular price
    }
    // Scenario 3: Only intro price exists (no duration, no regular price) - less ideal
    else if (introPrice != null && introPrice > 0) {
        return introPrice * calculationPeriodMonths; // Assume flat intro price
    }

    return null; // Not enough information
};


export const OfferCard: FC<OfferCardProps> = ({offer}) => {
    const {
        price_cents_month_intro,
        price_cents_month_regular,
        contract_duration_months, // This is the offer's minimum contract term
    } = offer;

    // Determine the period for average price calculation
    // Default to 24, but use contract_duration_months if it's longer.
    // If contract_duration_months is null/undefined, default to 24.
    const actualContractDuration = contract_duration_months ?? 0; // Treat null/undefined as 0 for comparison
    const calculationPeriodMonths = Math.max(24, actualContractDuration);

    let avgPriceDisplay: string = 'N/A';
    let avgPriceLabel: string = `Avg./mo (${calculationPeriodMonths}m)`;

    const grossTotalCost = calculateGrossTotalCostOverDynamicPeriod(
        price_cents_month_intro,
        price_cents_month_regular,
        contract_duration_months, // The intro period for pricing structure
        calculationPeriodMonths   // The total period for averaging
    );

    if (grossTotalCost != null) {
        const effectiveVoucherValue = calculateEffectiveVoucherValue(offer);
        const netTotalCost = Math.max(0, grossTotalCost - effectiveVoucherValue);
        const averageNetMonthlyCost = netTotalCost / calculationPeriodMonths;
        avgPriceDisplay = formatEur(Math.round(averageNetMonthlyCost));
    } else {
        // If gross cost couldn't be calculated, label might be less relevant or could also be 'N/A'
        avgPriceLabel = 'Avg./mo'; // Or some other fallback
    }

    // --- Prominent Bonus Text and Detail Badges (Logic remains the same as your provided code) ---
    let prominentBonusText: string | null = null;
    if ((offer.voucher_type === "absolute" || offer.voucher_type === "cashback") &&
        offer.voucher_value_cents != null && offer.voucher_value_cents > 0) {
        prominentBonusText = `${formatEur(offer.voucher_value_cents)} ${offer.voucher_type === "cashback" ? 'Cashback' : 'Bonus'}`;
    }

    const detailBadges: DetailBadgeInfo[] = [];
    if (offer.tv_included && offer.tv_package_name) {
        const tvText = `TV (${offer.tv_package_name.length > 10 ? `${offer.tv_package_name.substring(0, 8)}...` : offer.tv_package_name})`;
        detailBadges.push({key: 'tv', icon: Tv2, text: tvText, colorConfig: BADGE_COLORS.tv});
    } else if (offer.tv_included) {
        detailBadges.push({key: 'tv', icon: Tv2, text: "TV Incl.", colorConfig: BADGE_COLORS.tv});
    }

    if (offer.installation_service_included === true) {
        detailBadges.push({
            key: 'install',
            icon: DownloadCloud,
            text: "Install Incl.",
            colorConfig: BADGE_COLORS.install
        });
    } else if (offer.installation_service_included === false) {
        if (offer.installation_cost_cents != null && offer.installation_cost_cents > 0) {
            detailBadges.push({
                key: 'install',
                icon: DownloadCloud,
                text: `Install: ${formatEur(offer.installation_cost_cents)}`,
                colorConfig: BADGE_COLORS.install
            });
        } else {
            detailBadges.push({
                key: 'install',
                icon: DownloadCloud,
                text: "Install Opt.",
                colorConfig: BADGE_COLORS.install
            });
        }
    } else if (offer.installation_service_included == null) {
        if (offer.installation_cost_cents != null && offer.installation_cost_cents > 0) {
            detailBadges.push({
                key: 'install',
                icon: DownloadCloud,
                text: `Install: ${formatEur(offer.installation_cost_cents)}`,
                colorConfig: BADGE_COLORS.install
            });
        }
    }

    if (offer.data_cap_gb != null) {
        detailBadges.push({
            key: 'dataCap',
            icon: Database,
            text: `${offer.data_cap_gb} GB Cap`,
            colorConfig: BADGE_COLORS.dataCap,
        });
    } else {
        detailBadges.push({
            key: 'dataCap',
            icon: Database,
            text: `Unlimited Data`,
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

    if (!prominentBonusText &&
        (offer.voucher_type === "percentage" || (offer.voucher_type === "discount" && offer.voucher_value_percent != null)) &&
        offer.voucher_value_percent != null && offer.voucher_value_percent > 0) {
        detailBadges.push({
            key: 'discount',
            icon: Gift,
            text: `${offer.voucher_value_percent}% Off`,
            colorConfig: BADGE_COLORS.discount,
        });
    }

    // --- JSX for Price Sections (Logic remains the same as your provided code) ---
    let introPriceSection: JSX.Element | null = null;
    if (price_cents_month_intro != null) {
        const formattedIntroPrice = formatEur(price_cents_month_intro);
        const durationText = offer.contract_duration_months
            ? `first ${offer.contract_duration_months} months`
            : `for introductory period`;

        introPriceSection = (
            <div>
                <span className="text-[0.7rem] text-slate-400 block mb-0">Intro Price:</span>
                <p className="text-xl font-semibold text-white leading-tight">
                    {formattedIntroPrice} <span className="text-base font-normal text-slate-400">/mo</span>
                </p>
                <p className="text-[0.65rem] text-slate-500 leading-tight">
                    {durationText}
                </p>
            </div>
        );
    }

    let regularPriceSection: JSX.Element | null = null;
    if (price_cents_month_regular != null) {
        if (price_cents_month_intro == null || price_cents_month_regular !== price_cents_month_intro) {
            const formattedRegularPrice = formatEur(price_cents_month_regular);
            regularPriceSection = (
                <div>
                    <span className="text-[0.7rem] text-slate-400 block mb-0">
                        {price_cents_month_intro != null ? "Regular:" : "Monthly Price:"}
                    </span>
                    <p className="text-lg font-medium text-slate-300 leading-tight">
                        {formattedRegularPrice} <span className="text-sm font-normal text-slate-400">/mo</span>
                    </p>
                </div>
            );
        }
    }


    return (
        <motion.div
            layout
            initial={{opacity: 0, y: 15, scale: 0.98}}
            animate={{opacity: 1, y: 0, scale: 1}}
            exit={{opacity: 0, y: -10, scale: 0.98}}
            transition={{duration: 0.25, ease: "circOut"}}
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
                        {/* MODIFIED: Dynamic average price label */}
                        <p className="text-[0.65rem] text-slate-400">{avgPriceLabel}</p>
                        <p className="text-sm font-semibold text-indigo-300">{avgPriceDisplay}</p>
                    </div>
                </div>

                {/* Body: Speeds, Pricing, Contract Details */}
                <div className="p-4 pt-0 flex-grow flex flex-col justify-between">
                    <div>
                        {/* Speed Section */}
                        <div className="text-center mb-3">
                            <div
                                className="flex items-center justify-center text-[0.65rem] text-indigo-300 mb-0.5 font-medium">
                                <DownloadIcon size={14} className="mr-1 text-indigo-400"/> Download
                            </div>
                            <p className="text-4xl font-bold text-white leading-none">
                                {offer.speed_down_mbit != null ? offer.speed_down_mbit : 'N/A'}
                            </p>
                            <p className="text-xs text-slate-400 mb-1">Mbps</p>
                        </div>

                        {/* Pricing Section */}
                        <div className="space-y-1.5 mb-3">
                            {introPriceSection}
                            {regularPriceSection}
                            {/* MODIFIED: Check against grossTotalCost not grossTotalCost24Months */}
                            {(introPriceSection == null && regularPriceSection == null && grossTotalCost == null) && (
                                <p className="text-sm text-slate-400 text-center">Price information not available.</p>
                            )}
                        </div>

                        {/* Contract Details Section */}
                        <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-1.5">
                                <CalendarClock size={13} className="text-slate-500 shrink-0"/>
                                <span className="text-slate-400">Contract:</span>
                                <span className="font-medium text-slate-200">
                                    {offer.contract_duration_months != null ? `${offer.contract_duration_months} months` : 'N/A'}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Wifi size={13} className="text-slate-500 shrink-0"/>
                                <span className="text-slate-400">Type:</span>
                                <span className="font-medium text-slate-200">
                                    {offer.connection_type ?? 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Footer: Bonuses and Badges */}
                    {(prominentBonusText || detailBadges.length > 0) && (
                        <div className="mt-3 pt-3 border-t border-[#303558]/80 space-y-2">
                            {prominentBonusText && (
                                <Badge
                                    variant="default"
                                    className="w-full justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1.5 rounded-md leading-tight"
                                >
                                    <Sparkles size={14}/> {prominentBonusText}
                                </Badge>
                            )}
                            {detailBadges.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 justify-center">
                                    {detailBadges.map(badgeInfo => (
                                        <DetailBadgeComponent key={badgeInfo.key} {...badgeInfo} />
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