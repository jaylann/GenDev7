// src/components/offers/OfferCard.tsx
'use client';

import React, {FC, JSX, useMemo} from 'react';
import {motion} from 'framer-motion';
import {
    AlertTriangle,
    CalendarClock,
    Database,
    Download as DownloadIcon,
    Gift,
    HardHat,
    Info,
    Percent,
    Share2Icon,
    ShieldCheck,
    Sparkles,
    Tag,
    Tv2,
    Wifi
} from 'lucide-react';
import {Card} from '@/components/ui/card';
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Badge as ShadcnBadge} from '@/components/ui/badge';

import {formatDataCap, formatEur} from '@/utils/formatters';
import {
    calculateAvgNetMonthlyCost,
    getIntroPriceDurationMonths
} from '@/utils/calculations';
import {DetailBadgeComponent, type DetailBadgeInfo as CustomDetailBadgeInfo} from "@/components/compare/detail-badge";

import {cn} from '@/lib/utils';
import {Offer} from "@/types/offer";
import {getVoucherKindDisplayName, VoucherKind} from "@/types/voucher-kind";
import {ProviderLogo} from "@/components/compare/provider-logo";
import {ConnectionType, getConnectionTypeDisplayName} from "@/types/connection-type";

interface DetailBadgePropsForUserComponent extends Omit<CustomDetailBadgeInfo, 'icon'> {
    icon: React.ElementType;
}

// Badge color configurations
const BADGE_COLORS: Record<string, CustomDetailBadgeInfo['colorConfig']> = {
    tv: {bg: "bg-purple-600/20", text: "text-purple-300", border: "border-purple-500/50", icon: "text-purple-400"},
    install: {bg: "bg-sky-600/20", text: "text-sky-300", border: "border-sky-500/50", icon: "text-sky-400"},
    dataCap: {bg: "bg-amber-600/20", text: "text-amber-300", border: "border-amber-500/50", icon: "text-amber-400"},
    youth: {bg: "bg-teal-600/20", text: "text-teal-300", border: "border-teal-500/50", icon: "text-teal-400"},
    voucherInfo: {bg: "bg-pink-600/20", text: "text-pink-300", border: "border-pink-500/50", icon: "text-pink-400"},
};

/**
 * Props for the OfferCard component.
 */
interface OfferCardProps {
    /** The offer data to display. Crucial for the component to function. */
    offer: Offer;
    /** Optional callback for when the share icon is clicked. */
    onShareOffer?: (offer: Offer) => void;
    /**
     * The slug for the current full list of offers, required to enable sharing.
     * If null or undefined, the share button will not be rendered or will be disabled.
     */
    activeShareableSlug?: string | null;
    /** Optional className for custom styling on the root motion.div wrapper. */
    className?: string;
}

/**
 * `OfferCard` is a responsive, animated component for displaying internet offer details.
 * It follows a dark theme, uses shadcn UI components, Tailwind CSS, and Framer Motion.
 * It includes detailed calculations for average pricing and voucher effects.
 */
export const OfferCard: FC<OfferCardProps> = ({offer, onShareOffer, activeShareableSlug, className}) => {
    // Provide safe defaults to ensure hooks are called unconditionally.
    const safeOffer = (offer ?? {
        provider: '',
        plan_name: '',
        product_id: '',
        speed_down_mbit: 0,
        data_cap_gb: 0,
        connection_type: null,
        price_cents_month_intro: 0,
        price_cents_month_regular: 0,
        contract_duration_months: 0,
        installation_service_included: false,
        tv_included: false,
        tv_package_name: '',
        voucher_type: null,
        voucher_value_cents: 0,
        voucher_value_percent: 0,
        voucher_min_order_value_cents: 0,
        voucher_max_value_cents: 0,
        voucher_max_runtime_months: 0,
        max_age: 0,
    }) as unknown as Offer;

    const {
        provider,
        plan_name,
        product_id,
        speed_down_mbit,
        data_cap_gb,
        connection_type,
        price_cents_month_intro,
        price_cents_month_regular,
        contract_duration_months,
        installation_service_included,
        tv_included,
        tv_package_name,
        voucher_type,
        voucher_value_cents,
        voucher_value_percent,
        voucher_min_order_value_cents,
        voucher_max_value_cents,
        voucher_max_runtime_months,
        max_age,
    } = safeOffer;

    const introPriceDuration = useMemo(() => getIntroPriceDurationMonths(offer), [offer]);

    const calculationPeriodMonths = useMemo(
        () => Math.max(24, contract_duration_months),
        [contract_duration_months]
    );

    // Calculate numeric average net monthly cost
    const avgNetCost = useMemo(
        () => calculateAvgNetMonthlyCost(offer, calculationPeriodMonths),
        [offer, calculationPeriodMonths]
    );

    // Format label and display in the UI layer
    const avgPriceLabel = avgNetCost != null
        ? `Avg./mo (${calculationPeriodMonths}m)`
        : 'Avg./mo';
    const avgPriceDisplay = avgNetCost != null
        ? formatEur(avgNetCost)
        : 'N/A';

    const prominentBonusText = useMemo<string | null>(() => {
        if (voucher_type && (voucher_type === VoucherKind.ABSOLUTE || voucher_type === VoucherKind.CASHBACK) && voucher_value_cents != null && voucher_value_cents > 0) {
            let value = voucher_value_cents;
            if (voucher_max_value_cents != null) {
                value = Math.min(value, voucher_max_value_cents);
            }
            // Use getVoucherKindDisplayName for consistency in naming
            return `${formatEur(value)} ${getVoucherKindDisplayName(voucher_type)}`;
        }
        return null;
    }, [voucher_type, voucher_value_cents, voucher_max_value_cents]);

    const detailBadges = useMemo<DetailBadgePropsForUserComponent[]>(() => {
        const badges: DetailBadgePropsForUserComponent[] = [];

        if (tv_included) {
            const tvText = tv_package_name ? (tv_package_name.length > 12 ? `${tv_package_name.substring(0, 10)}...` : tv_package_name) : "TV Incl.";
            badges.push({
                badgeKey: 'tv', icon: Tv2, text: tvText, colorConfig: BADGE_COLORS.tv,
            });
        }

        badges.push({
            badgeKey: 'install',
            icon: HardHat,
            text: installation_service_included ? "Install. Free" : "Install. Costs",
            colorConfig: BADGE_COLORS.install,
        });

        badges.push({
            badgeKey: 'dataCap',
            icon: Database,
            text: formatDataCap(data_cap_gb).replace(" Data", ""),
            colorConfig: BADGE_COLORS.dataCap,
        });

        if (max_age != null) {
            badges.push({
                badgeKey: 'youth', icon: ShieldCheck, text: `Youth (≤${max_age}y)`, colorConfig: BADGE_COLORS.youth,
            });
        }
        return badges;
    }, [tv_included, tv_package_name, installation_service_included, data_cap_gb, max_age, prominentBonusText, voucher_type, voucher_value_percent]);

    const introPriceSection = useMemo<JSX.Element | null>(() => {
        if (price_cents_month_intro != null && price_cents_month_intro > 0) {
            const durationText = introPriceDuration > 0 ? `first ${introPriceDuration} months` : `for introductory period`;
            return (<div>
                    <span className="text-[0.7rem] text-slate-400 block mb-0">Intro Price:</span>
                    <p className="text-xl font-semibold text-white leading-tight">
                        {formatEur(price_cents_month_intro)} <span
                        className="text-base font-normal text-slate-400">/mo</span>
                    </p>
                    <p className="text-[0.65rem] text-slate-500 leading-tight">
                        {durationText}
                    </p>
                </div>);
        }
        return null;
    }, [price_cents_month_intro, introPriceDuration]);

    const regularPriceSection = useMemo<JSX.Element | null>(() => {
        if (price_cents_month_regular != null && price_cents_month_regular > 0) {
            if (price_cents_month_intro == null || price_cents_month_regular !== price_cents_month_intro) {
                return (<div>
            <span className="text-[0.7rem] text-slate-400 block mb-0">
              {price_cents_month_intro != null ? "Then:" : "Price:"}
            </span>
                        <p className="text-lg font-medium text-slate-300 leading-tight">
                            {formatEur(price_cents_month_regular)} <span
                            className="text-sm font-normal text-slate-400">/mo</span>
                        </p>
                    </div>);
            }
        }
        return null;
    }, [price_cents_month_intro, price_cents_month_regular]);

    const renderVoucherPopoverContent = () => {
        if (!voucher_type) return <p className="p-4 text-sm text-slate-400">No active voucher for this offer.</p>;

        const details = [];
        if (voucher_value_cents != null && (voucher_type === VoucherKind.ABSOLUTE || voucher_type === VoucherKind.CASHBACK || (voucher_type === VoucherKind.DISCOUNT && voucher_value_percent == null))) {
            details.push(<div className="flex items-center" key="val-cents">
                <Tag size={16} className="mr-2 text-sky-400 shrink-0"/>
                Value:{'\u00A0'}<strong>{formatEur(voucher_value_cents)}</strong>
            </div>);
        }
        if (voucher_value_percent != null && (voucher_type === VoucherKind.PERCENTAGE || voucher_type === VoucherKind.DISCOUNT)) {
            details.push(<div className="flex items-center" key="val-percent">
                <Percent size={16} className="mr-2 text-sky-400 shrink-0"/>
                Discount:{'\u00A0'}<strong>{voucher_value_percent}%</strong>
            </div>);
        }
        if (voucher_max_value_cents != null) {
            details.push(<div className="flex items-center" key="max-val">
                <AlertTriangle size={16} className="mr-2 text-orange-400 shrink-0"/>
                Max. Benefit:{'\u00A0'}<strong>{formatEur(voucher_max_value_cents)}</strong>
            </div>);
        }
        if (voucher_min_order_value_cents != null) {
            details.push(<div className="flex items-center" key="min-order">
                <Info size={16} className="mr-2 text-slate-400 shrink-0"/>
                Min. Order Value:{'\u00A0'}<strong>{formatEur(voucher_min_order_value_cents)}</strong>
            </div>);
        }
        if (voucher_max_runtime_months != null) {
            details.push(<div className="flex items-center" key="max-runtime">
                <CalendarClock size={16} className="mr-2 text-purple-400 shrink-0"/>
                Max. Duration:{'\u00A0'}<strong>{voucher_max_runtime_months} months</strong>
            </div>);
        }
        if (details.length === 0) {
            details.push(<p key="no-details"
                            className="text-slate-400">General {getVoucherKindDisplayName(voucher_type)} applies.</p>)
        }

        return (<div
                className="p-4 space-y-2.5 text-sm bg-[#232740] border border-[#303558] text-slate-200 rounded-md shadow-xl">
                <h4 className="font-semibold text-base mb-2 text-white">{getVoucherKindDisplayName(voucher_type)} Details</h4>
                {details}
                {(voucher_type === VoucherKind.PERCENTAGE || (voucher_type === VoucherKind.DISCOUNT && voucher_value_percent != null)) && (
                    <p className="text-xs text-slate-400 mt-3 pt-2 border-t border-[#303558]/50">
                        Percentage discount applies monthly to the current tariff price, up to the maximum benefit and
                        duration shown.
                    </p>)}
            </div>);
    };

    const voucherInteractiveDisplay = useMemo(() => {
        if (!voucher_type) return null;

        let summaryText = getVoucherKindDisplayName(voucher_type);
        let IconComponent: React.ElementType = Gift;

        if (prominentBonusText) {
            summaryText = prominentBonusText;
            IconComponent = Sparkles;
        } else if (voucher_type === VoucherKind.PERCENTAGE && voucher_value_percent != null) {
            summaryText = `${voucher_value_percent}% Off`;
            IconComponent = Percent;
        } else if (voucher_type === VoucherKind.DISCOUNT) {
            if (voucher_value_cents != null) summaryText = `${formatEur(voucher_value_cents)} Discount`; else if (voucher_value_percent != null) summaryText = `${voucher_value_percent}% Discount`; else summaryText = "Special Discount"; // Keep default if no value
            IconComponent = Tag;
        }

        return (<Popover>
                <PopoverTrigger asChild>
                    {/* Using ShadcnBadge for the trigger to ensure it's a valid child for asChild */}
                    <ShadcnBadge
                        variant="default"
                        className={cn("w-full cursor-pointer justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md leading-tight transition-all hover:opacity-80 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C203C]", prominentBonusText ? "bg-green-500 hover:bg-green-600 text-white" : "bg-pink-600 hover:bg-pink-700 text-white")}
                    >
                        <IconComponent size={14}/> {summaryText}
                    </ShadcnBadge>
                </PopoverTrigger>
                <PopoverContent className="w-80 z-50 p-0 border-none bg-transparent" side="top" align="center">
                    {renderVoucherPopoverContent()}
                </PopoverContent>
            </Popover>);
    }, [voucher_type, prominentBonusText, voucher_value_percent, voucher_value_cents,]);

    if (!offer) {
        return (<Card
                className={cn("h-full p-4 flex items-center justify-center bg-[#1C203C] border border-[#303558]/80 text-slate-300", className)}>
                <p>Offer data is unavailable.</p>
            </Card>);
    }

    return (<motion.div
            layout
            initial={{opacity: 0, y: 15, scale: 0.98}}
            animate={{opacity: 1, y: 0, scale: 1}}
            exit={{opacity: 0, y: -10, scale: 0.98}}
            transition={{duration: 0.25, ease: "circOut"}}
            className={cn("h-full", className)}
            data-testid={`offer-card-${product_id}`}
        >
            <Card
                className="h-full py-2 bg-[#1C203C] border border-[#303558]/80 text-slate-300 flex flex-col rounded-lg shadow-xl hover:border-indigo-600/70 transition-colors duration-200 group">
                <div className="p-4 flex items-start sm:items-center gap-3 border-b border-[#303558]/80">
                    <ProviderLogo providerName={provider} className="!size-10 mt-1 sm:mt-0 shrink-0"/>
                    <div className="flex-grow min-w-0">
                        <h3 className="text-base sm:text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors leading-tight truncate"
                            title={plan_name}>
                            {plan_name}
                        </h3>
                        <p className="text-[0.7rem] text-slate-400 truncate leading-tight"
                           title={`Provider: ${provider}, Product ID: ${product_id}`}>
                            by {provider}
                        </p>
                    </div>

                    <div className="ml-auto text-right flex-shrink-0">
                        <div className="relative">
                            <div
                                className={cn("transition-opacity duration-200", (activeShareableSlug && onShareOffer) && "group-hover:opacity-30 group-focus-within:opacity-30")}>
                                <p className="text-[0.65rem] text-slate-400 whitespace-nowrap">{avgPriceLabel}</p>
                                <p className="text-sm sm:text-base font-semibold text-indigo-300">{avgPriceDisplay}</p>
                            </div>
                            {activeShareableSlug && onShareOffer && (<button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onShareOffer(offer);
                                    }}
                                    disabled={!activeShareableSlug}
                                    aria-label={`Share ${plan_name}`}
                                    title={`Share ${plan_name} details`}
                                    className={cn("absolute inset-0 z-10 flex items-center justify-center rounded-md", "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100", "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C203C]", "transition-all duration-200 ease-in-out hover:bg-indigo-500/20")}
                                >
                                    <Share2Icon size={18}
                                                className="text-indigo-300 group-hover:scale-110 transition-transform"/>
                                </button>)}
                        </div>
                    </div>
                </div>

                <div className="p-4 pt-3 flex-grow flex flex-col justify-between">
                    <div>
                        <div className="text-center mb-4">
                            <div
                                className="flex items-center justify-center text-[0.65rem] text-indigo-300 mb-0.5 font-medium">
                                <DownloadIcon size={14} className="mr-1 text-indigo-400"/> Download Speed
                            </div>
                            <p className="text-4xl font-bold text-white leading-none">
                                {speed_down_mbit ?? 'N/A'}
                            </p>
                            <p className="text-xs text-slate-400 mb-1">Mbps</p>
                        </div>

                        <div className="space-y-2 mb-4">
                            {introPriceSection}
                            {regularPriceSection}
                            {!introPriceSection && !regularPriceSection && (
                                <p className="text-sm text-slate-400 text-center py-2">Price information not
                                    available.</p>)}
                        </div>

                        <div className="space-y-1.5 text-xs">
                            <div className="flex items-center gap-1.5">
                                <CalendarClock size={13} className="text-slate-500 shrink-0"/>
                                <span className="text-slate-400">Contract:</span>
                                <span className="font-medium text-slate-200">
                  {contract_duration_months ? `${contract_duration_months} months` : 'N/A'}
                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Wifi size={13} className="text-slate-500 shrink-0"/>
                                <span className="text-slate-400">Type:</span>
                                <span className="font-medium text-slate-200">
                  {connection_type ? getConnectionTypeDisplayName(connection_type as ConnectionType) : 'N/A'}
                </span>
                            </div>
                        </div>
                    </div>

                    {(voucherInteractiveDisplay || detailBadges.length > 0) && (
                        <div className="mt-4 pt-4 border-t border-[#303558]/80 space-y-2.5">
                            {voucherInteractiveDisplay}

                            {detailBadges.length > 0 && (<div className="flex flex-wrap gap-1.5 justify-center pt-1">
                                    {detailBadges.map(badgeProps => (
                                        <DetailBadgeComponent
                                            key={badgeProps.badgeKey}
                                            badgeKey={badgeProps.badgeKey}
                                            icon={badgeProps.icon}
                                            text={badgeProps.text}
                                            colorConfig={badgeProps.colorConfig}
                                        />
                                    ))}
                                </div>)}
                        </div>)}
                </div>
            </Card>
        </motion.div>);
};