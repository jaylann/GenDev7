import React, {FC, JSX} from "react";
import {
    CalendarClock,
    Database,
    Download as DownloadIcon,
    DownloadCloud,
    Gift,
    Share2Icon,
    ShieldCheck,
    Sparkles,
    Tv2,
    Wifi
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {motion} from "framer-motion";
import {Card} from "@/components/ui/card";
import {Offer} from "@/types/offer";
import {formatEur} from "@/utils/formatters";
import {ProviderLogo} from "@/components/compare/provider-logo";
import {DetailBadgeComponent, DetailBadgeInfo} from "@/components/compare/detail-badge";
import {cn} from "@/lib/utils"; // Import cn utility

// Badge color configurations (assuming they are the same)
const BADGE_COLORS = {
    tv: {bg: "bg-purple-600/20", text: "text-purple-300", border: "border-purple-500/50", icon: "text-purple-400"},
    install: {bg: "bg-sky-600/20", text: "text-sky-300", border: "border-sky-500/50", icon: "text-sky-400"},
    dataCap: {bg: "bg-amber-600/20", text: "text-amber-300", border: "border-amber-500/50", icon: "text-amber-400"},
    youth: {bg: "bg-teal-600/20", text: "text-teal-300", border: "border-teal-500/50", icon: "text-teal-400"},
    discount: {bg: "bg-pink-600/20", text: "text-pink-300", border: "border-pink-500/50", icon: "text-pink-400"},
};

interface OfferCardProps {
    offer: Offer;
    /** Callback to handle sharing a single offer. */
    onShareOffer: (offer: Offer) => void;
    /** The slug for the current full list of offers, required to enable sharing. */
    activeShareableSlug: string | null;
}

// --- Helper Functions for Price Calculation (assuming these are correct and remain unchanged) ---
const calculateEffectiveVoucherValue = (offer: Offer): number => {
    // ... (implementation from your provided code)
    let totalVoucherValueApplied = 0;

    if (!offer.voucher_type) {
        return 0;
    }
    switch (offer.voucher_type) {
        case "absolute":
        case "cashback":
            totalVoucherValueApplied = offer.voucher_value_cents ?? 0;
            break;

        case "percentage":
        case "discount":
            if (offer.voucher_value_percent != null && offer.voucher_value_percent > 0) {
                const monthlyIntroPrice = offer.price_cents_month_intro;
                const introDurationForVoucher = offer.contract_duration_months;
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
            break;
    }
    return Math.max(0, Math.round(totalVoucherValueApplied));
};

const calculateGrossTotalCostOverDynamicPeriod = (
    introPrice: number | null | undefined,
    regularPrice: number | null | undefined,
    introDurationMonths: number | null | undefined,
    calculationPeriodMonths: number
): number | null => {
    // ... (implementation from your provided code)
    if (introPrice != null && introPrice > 0 && introDurationMonths != null && introDurationMonths > 0) {
        const effectiveRegularPrice = regularPrice ?? introPrice;
        if (introDurationMonths >= calculationPeriodMonths) {
            return introPrice * calculationPeriodMonths;
        } else {
            return (introPrice * introDurationMonths) + (effectiveRegularPrice * (calculationPeriodMonths - introDurationMonths));
        }
    } else if (regularPrice != null && regularPrice > 0) {
        return regularPrice * calculationPeriodMonths;
    } else if (introPrice != null && introPrice > 0) {
        return introPrice * calculationPeriodMonths;
    }
    return null;
};


export const OfferCard: FC<OfferCardProps> = ({offer, onShareOffer, activeShareableSlug}) => {
    const {
        price_cents_month_intro,
        price_cents_month_regular,
        contract_duration_months,
    } = offer;

    const actualContractDuration = contract_duration_months ?? 0;
    const calculationPeriodMonths = Math.max(24, actualContractDuration);

    let avgPriceDisplay: string = 'N/A';
    let avgPriceLabel: string = `Avg./mo (${calculationPeriodMonths}m)`;

    const grossTotalCost = calculateGrossTotalCostOverDynamicPeriod(
        price_cents_month_intro,
        price_cents_month_regular,
        offer.intro_duration_months ?? contract_duration_months, // Use intro_duration_months if available, else contract_duration_months
        calculationPeriodMonths
    );

    if (grossTotalCost != null) {
        const effectiveVoucherValue = calculateEffectiveVoucherValue(offer);
        const netTotalCost = Math.max(0, grossTotalCost - effectiveVoucherValue);
        const averageNetMonthlyCost = netTotalCost / calculationPeriodMonths;
        avgPriceDisplay = formatEur(Math.round(averageNetMonthlyCost));
    } else {
        avgPriceLabel = 'Avg./mo';
    }

    // --- Prominent Bonus Text and Detail Badges ---
    // ... (logic from your provided code, unchanged)
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
            key: 'install', icon: DownloadCloud, text: "Install Incl.", colorConfig: BADGE_COLORS.install
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
                key: 'install', icon: DownloadCloud, text: "Install Opt.", colorConfig: BADGE_COLORS.install
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
            key: 'dataCap', icon: Database, text: `${offer.data_cap_gb} GB Cap`, colorConfig: BADGE_COLORS.dataCap,
        });
    } else {
        detailBadges.push({
            key: 'dataCap', icon: Database, text: `Unlimited Data`, colorConfig: BADGE_COLORS.dataCap,
        });
    }

    if (offer.max_age != null) {
        detailBadges.push({
            key: 'youth', icon: ShieldCheck, text: `Youth (≤${offer.max_age}y)`, colorConfig: BADGE_COLORS.youth,
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
    // --- JSX for Price Sections ---
    // ... (logic from your provided code, unchanged)
    let introPriceSection: JSX.Element | null = null;
    if (price_cents_month_intro != null) {
        const formattedIntroPrice = formatEur(price_cents_month_intro);
        const durationText = (offer.intro_duration_months ?? offer.contract_duration_months)
            ? `first ${offer.intro_duration_months ?? offer.contract_duration_months} months`
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
                {/* Header: Provider Info and Average Price with Share Button */}
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

                    {/* MODIFIED: Average Price and Share Icon Area */}
                    <div className="ml-auto text-right">
                        <div className="relative"> {/* Container for positioning */}
                            {/* Average Price Content - will be visually altered on group-hover */}
                            <div
                                className="transition-opacity duration-200 group-hover:opacity-30 group-focus-within:opacity-30">
                                <p className="text-[0.65rem] text-slate-400">{avgPriceLabel}</p>
                                <p className="text-sm font-semibold text-indigo-300">{avgPriceDisplay}</p>
                            </div>

                            {/* Share Icon Button - appears on group-hover and overlays */}
                            {activeShareableSlug && ( // Only render if sharing is possible
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation(); // Prevent card click if it has other actions
                                        onShareOffer(offer);
                                    }}
                                    disabled={!activeShareableSlug}
                                    aria-label={`Share ${offer.plan_name}`}
                                    title={`Share ${offer.plan_name} details`}
                                    className={cn(
                                        "absolute inset-0 z-10 flex items-center justify-center rounded-md",
                                        "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100", // Also show on focus within card
                                        "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C203C]",
                                        "transition-all duration-200 ease-in-out",
                                        "hover:bg-indigo-500/20" // Slight bg on direct hover of the button itself
                                    )}
                                >
                                    <Share2Icon size={18}
                                                className="text-indigo-300 group-hover:scale-110 transition-transform"/>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Body: Speeds, Pricing, Contract Details (unchanged structure) */}
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

                    {/* Footer: Bonuses and Badges (unchanged structure) */}
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